import { log_error } from './game/logger.js';
import { app, BrowserWindow, screen } from 'electron';
import * as path from 'path';

function create_window(): void {
    const primary_display = screen.getPrimaryDisplay();
    const { width: screen_width, height: screen_height } = primary_display.workAreaSize;

    const window_width = 405;
    const window_height = 720;

    const main_window = new BrowserWindow({
        width: window_width,
        height: window_height,
        minWidth: window_width,
        minHeight: window_height,
        resizable: true,
        frame: true,
        title: 'Untitled P Project',
        backgroundColor: '#FFFFFF',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },

        x: Math.floor((screen_width - window_width) / 2),
        y: Math.floor((screen_height - window_height) / 2),
    });

    const html_path = path.join(__dirname, '../index.html');
    const is_bot_active = process.argv.includes('--bot');

    main_window.loadFile(html_path, { query: is_bot_active ? { bot: 'true' } : {} }).catch(error => {
        log_error('Failed to load HTML file:', error);
    });

    main_window.setMenuBarVisibility(false);

    main_window.on('closed', () => {});
}

app.whenReady().then(() => {
    create_window();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            create_window();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('certificate-error', (event, _web_contents, _url, _error, _certificate, callback) => {
    event.preventDefault();
    callback(true);
});
