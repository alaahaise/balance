/**
 * Lecture du cadre série de la balance.
 *
 * Entièrement piloté par la configuration (fichier local du poste) : le format
 * d'un indicateur de pesage varie d'un modèle à l'autre, et un format deviné
 * faux obligerait à recompiler l'application.
 */

export interface BalanceConfig {
  port: string
  baud: number
  dataBits: 7 | 8
  parity: 'none' | 'even' | 'odd'
  stopBits: 1 | 2
  /** Octets à envoyer pour demander le poids, en hexadécimal. null = la balance émet en continu. */
  requestHex: string | null
  /** Période d'envoi de la demande, en ms. 0 = ne jamais demander. */
  pollMs: number
  /** Regex dont le groupe 1 (ou à défaut la correspondance entière) est le poids. */
  frameRegex: string
  decimalSep: '.' | ','
  unit: string
  /** Durée de stabilité exigée avant une capture automatique. */
  stableMs: number
  /** Variation maximale tolérée pour considérer le poids comme stable, en kg. */
  stableEpsilon: number
  /** Fréquence de rafraîchissement de l'interface, en Hz. */
  uiHz: number
  /**
   * Balance simulée : aucun port série n'est ouvert, les poids sont fictifs.
   * Réservé au développement hors site ; absent ou false = vraie balance.
   */
  simulate?: boolean
}

export const DEFAULT_BALANCE_CONFIG: BalanceConfig = {
  port: 'COM1',
  baud: 9600,
  dataBits: 8,
  parity: 'none',
  stopBits: 1,
  requestHex: '0D',
  pollMs: 200,
  frameRegex: '([+-]?[0-9]+(?:[.,][0-9]+)?)',
  decimalSep: '.',
  unit: 'kg',
  stableMs: 600,
  stableEpsilon: 0.5,
  uiHz: 20
}

/**
 * Découpe le flux reçu en cadres complets et renvoie le fragment incomplet.
 * Un cadre peut arriver coupé en deux par le pilote série : jeter le fragment
 * perdrait une pesée sur deux.
 */
export function splitFrames(buffer: string): { frames: string[]; rest: string } {
  const parts = buffer.split(/\r\n|\r|\n/)
  const rest = parts.pop() ?? ''
  return { frames: parts.filter((p) => p.trim().length > 0), rest }
}

/** Renvoie le poids en kg, ou null si le cadre est illisible. */
export function parseFrame(
  frame: string,
  config: Pick<BalanceConfig, 'frameRegex' | 'decimalSep'>
): number | null {
  if (!frame.trim()) return null

  let regex: RegExp
  try {
    regex = new RegExp(config.frameRegex)
  } catch {
    return null // regex invalide dans les paramètres : ne pas faire tomber la lecture
  }

  const match = regex.exec(frame)
  if (!match) return null

  const captured = match[1] ?? match[0]
  // La virgule est le séparateur décimal de la plupart des indicateurs ; la
  // normaliser évite un NaN silencieux qui se propagerait jusqu'au net.
  const value = Number(captured.replace(',', '.'))

  return Number.isFinite(value) ? value : null
}

/**
 * Convertit une chaîne hexadécimale ('0D', '0d 0a') en octets.
 * Renvoie un Uint8Array et non un Buffer : ce module est partagé avec le
 * renderer, où `Buffer` n'existe pas.
 */
export function hexToBytes(hex: string | null): Uint8Array | null {
  if (hex == null) return null
  const clean = hex.replace(/[^0-9a-fA-F]/g, '')
  if (clean.length === 0 || clean.length % 2 !== 0) return null
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  return out
}

/**
 * Dernier poids trouvé dans un flux continu sans délimiteur : certains
 * indicateurs envoient des trames à longueur fixe, jamais de retour à la ligne.
 */
export function parseLastWeight(
  text: string,
  config: Pick<BalanceConfig, 'frameRegex' | 'decimalSep'>
): number | null {
  let regex: RegExp
  try {
    regex = new RegExp(config.frameRegex, 'g')
  } catch {
    return null
  }
  let last: string | null = null
  for (const match of text.matchAll(regex)) last = match[1] ?? match[0]
  return last == null ? null : parseFrame(last, config)
}

/** Intervalle minimum entre deux rafraîchissements d'interface, en ms. */
export function uiIntervalMs(uiHz: number): number {
  const hz = uiHz > 0 ? uiHz : DEFAULT_BALANCE_CONFIG.uiHz
  return Math.max(1000 / hz, 16)
}
