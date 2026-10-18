/**
 * Lecture de la balance série.
 *
 * Principes :
 *  - `serialport` est chargé à la demande : si le module natif n'est pas
 *    compilé pour Electron, l'application démarre quand même et l'erreur
 *    s'affiche dans l'écran Paramètres au lieu de tuer le processus ;
 *  - les trames sont découpées sur les retours à la ligne, avec repli sur un
 *    flux continu sans délimiteur ;
 *  - l'interface n'est rafraîchie qu'à `uiHz` : à 200 Hz de lecture, repeindre
 *    React à chaque échantillon rendrait l'application inutilisable ;
 *  - « stable » est un événement de transition, pas un état continu, sinon une
 *    balance immobile déclencherait une capture à chaque échantillon.
 */
import { EventEmitter } from 'node:events'
import type { SerialPort as SerialPortInstance } from 'serialport'
import type * as SerialPortNamespace from 'serialport'
import type { BalanceStatus } from '@shared/channels'
import {
  hexToBytes,
  parseFrame,
  parseLastWeight,
  splitFrames,
  uiIntervalMs,
  type BalanceConfig
} from '@shared/domain/balance-parser'
import {
  DEFAULT_SIM_OPTIONS,
  initialSim,
  setSimTarget,
  stepSim,
  type SimState
} from '@shared/domain/simulator'
import { INITIAL_STABILITY, nextStability, type StabilityState } from '@shared/domain/stability'
import type { WeightSample } from '@shared/types'

type SerialPortModule = typeof SerialPortNamespace
let serialModule: SerialPortModule | null = null

async function loadSerialport(): Promise<SerialPortModule> {
  if (serialModule) return serialModule
  try {
    serialModule = await import('serialport')
    return serialModule
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    throw new Error(
      `Module série indisponible (${detail}). Lancez « npm run rebuild » pour le compiler pour Electron.`,
      { cause: err }
    )
  }
}

/** Au-delà, considérer le flux comme continu et non délimité. */
const CONTINUOUS_THRESHOLD = 256

export class BalanceService extends EventEmitter {
  private port: SerialPortInstance | null = null
  private config: BalanceConfig | null = null
  private buffer = ''
  private stability: StabilityState = INITIAL_STABILITY
  private pending: WeightSample | null = null
  private flushTimer: NodeJS.Timeout | null = null
  private pollTimer: NodeJS.Timeout | null = null
  private wasStable = false
  private lastError: string | null = null
  private simTimer: NodeJS.Timeout | null = null
  private sim: SimState = initialSim()

  status(): BalanceStatus {
    const simulated = this.simTimer !== null
    return {
      running: simulated || this.port?.isOpen === true,
      port: simulated ? 'SIMULATEUR' : (this.config?.port ?? null),
      lastError: this.lastError,
      simulated
    }
  }

  /** Remet à zéro tout l'état de lecture, pour une vraie balance comme pour le simulateur. */
  private begin(config: BalanceConfig): void {
    this.config = config
    this.buffer = ''
    this.stability = INITIAL_STABILITY
    this.pending = null
    this.wasStable = false
    this.lastError = null
  }

  async start(config: BalanceConfig): Promise<BalanceStatus> {
    await this.stop()
    if (config.simulate) return this.startSimulator(config)
    const { SerialPort } = await loadSerialport()

    this.begin(config)

    const port = new SerialPort({
      path: config.port,
      baudRate: config.baud,
      dataBits: config.dataBits,
      parity: config.parity,
      stopBits: config.stopBits,
      autoOpen: false
    })

    await new Promise<void>((resolve, reject) => {
      port.open((err) => (err ? reject(new Error(`Ouverture de ${config.port} impossible : ${err.message}`)) : resolve()))
    })

    this.port = port
    port.on('data', (chunk: Buffer) => this.onData(chunk))
    port.on('error', (err: Error) => {
      this.lastError = err.message
      this.emit('status', this.status())
    })
    port.on('close', () => this.emit('status', this.status()))

    // Rafraîchissement de l'interface, découplé de la vitesse de lecture.
    this.flushTimer = setInterval(() => this.flush(), uiIntervalMs(config.uiHz))
    this.flushTimer.unref?.()

    const request = hexToBytes(config.requestHex)
    if (request && config.pollMs > 0) {
      this.pollTimer = setInterval(() => {
        if (this.port?.isOpen) this.port.write(Buffer.from(request))
      }, config.pollMs)
      this.pollTimer.unref?.()
    }

    this.emit('status', this.status())
    return this.status()
  }

  /**
   * Balance virtuelle : les mêmes échantillons que la vraie passent par `ingest`
   * (stabilité, événements, throttling UI), seule la source change. La trame
   * brute commence par « SIM » : un poids fictif enregistré par erreur dans une
   * base reste repérable dans `weighings.raw_response`.
   */
  private startSimulator(config: BalanceConfig): BalanceStatus {
    this.begin(config)
    this.sim = initialSim()
    const opts = { ...DEFAULT_SIM_OPTIONS, epsilonKg: config.stableEpsilon }

    let last = Date.now()
    this.simTimer = setInterval(() => {
      const now = Date.now()
      this.sim = stepSim(this.sim, now - last, Math.random, opts)
      last = now
      this.ingest(this.sim.weight, `SIM ${this.sim.weight.toFixed(2)} ${config.unit}`)
    }, 50)
    this.simTimer.unref?.()

    this.flushTimer = setInterval(() => this.flush(), uiIntervalMs(config.uiHz))
    this.flushTimer.unref?.()

    this.emit('status', this.status())
    return this.status()
  }

  /** Pose un poids sur le pont virtuel. Refusé si le simulateur n'est pas actif. */
  setSimWeight(kg: number): void {
    if (this.simTimer === null) throw new Error('Simulateur inactif : activez-le dans Paramètres')
    this.sim = setSimTarget(this.sim, kg)
  }

  async stop(): Promise<void> {
    if (this.pollTimer) clearInterval(this.pollTimer)
    if (this.flushTimer) clearInterval(this.flushTimer)
    if (this.simTimer) clearInterval(this.simTimer)
    this.pollTimer = null
    this.flushTimer = null
    this.simTimer = null

    const port = this.port
    this.port = null
    if (port?.isOpen) {
      await new Promise<void>((resolve) => port.close(() => resolve()))
    }
  }

  private onData(chunk: Buffer): void {
    const config = this.config
    if (!config) return

    // latin1 : les indicateurs émettent des octets 7/8 bits, un décodage UTF-8
    // corromprait une trame coupée au milieu d'un caractère accentué.
    this.buffer += chunk.toString('latin1')

    const { frames, rest } = splitFrames(this.buffer)
    this.buffer = rest
    for (const frame of frames) {
      const weight = parseFrame(frame, config)
      if (weight != null) this.ingest(weight, frame)
    }

    // Flux continu sans retour à la ligne : ne pas laisser le tampon grossir
    // indéfiniment, et lire la dernière mesure disponible.
    if (this.buffer.length > CONTINUOUS_THRESHOLD) {
      const weight = parseLastWeight(this.buffer, config)
      const raw = this.buffer.slice(-64)
      this.buffer = ''
      if (weight != null) this.ingest(weight, raw)
    }
  }

  private ingest(weight: number, raw: string): void {
    const config = this.config
    if (!config) return

    const atMs = Date.now()
    this.stability = nextStability(this.stability, { weight, atMs }, config.stableEpsilon, config.stableMs)

    const sample: WeightSample = {
      weight,
      unit: config.unit,
      stable: this.stability.stable,
      stableMs: this.stability.stableMs,
      raw,
      at: new Date(atMs).toISOString()
    }

    this.pending = sample

    if (this.stability.stable && !this.wasStable) this.emit('stable', sample)
    this.wasStable = this.stability.stable
  }

  private flush(): void {
    if (!this.pending) return
    const sample = this.pending
    this.pending = null
    this.emit('sample', sample)
  }
}

/** Un seul port série par poste : une instance partagée. */
export const balance = new BalanceService()

export async function listPorts(): Promise<string[]> {
  const { SerialPort } = await loadSerialport()
  const ports = await SerialPort.list()
  return ports.map((p) => p.path)
}
