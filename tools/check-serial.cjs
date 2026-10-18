// Vérification ponctuelle : le module natif série se charge-t-il sous Electron ?
const { app } = require('electron')

app.whenReady().then(async () => {
  try {
    const serialport = require('serialport')
    const ports = await serialport.SerialPort.list()
    console.log('SERIALPORT_OK', JSON.stringify(ports))
    console.log('ELECTRON', process.versions.electron, 'MODULES', process.versions.modules)
  } catch (err) {
    console.log('SERIALPORT_FAIL', err.message)
  }
  app.quit()
})
