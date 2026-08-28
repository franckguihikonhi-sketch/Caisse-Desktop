const electron = require('electron');
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const ipc = electron.ipcMain;

let mainform
let mainWindow
let main
function createWindow () 
{

  main = new BrowserWindow({});
  main.loadURL(`file://${__dirname}/index.html`);
  mainform = new BrowserWindow({ width:1000 , height:400 });
  mainform.loadURL(`file://${__dirname}/form.html`);
  mainWindow = new BrowserWindow({ width: 800,     height: 500,    
     maximized: false,     center: true,     frame: false }); 
     mainWindow.loadURL(`file://${__dirname}/index2.html`);
     main.on('closed', () => {
    main = null;
  })
}


// Le reste de notre code (ouverture de fenêtre, etc) …

/*ipc.on('log-error', () => {
    console.log('Erreur ! Veuillez rapporter ce bug au développeur de l\'application.');
});
app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }


 
});*/
