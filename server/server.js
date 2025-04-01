const WebSocket = require('ws');
const os = require('os');
const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('database.db', (err) => {
    if (err) console.error('Database connection error:', err.message);
    else console.log('Connected to SQLite database.');
});

const server = new WebSocket.Server({ port: 8080 });
let clients = new Set();

server.on('connection', (ws) => {
    console.log('Client connected');
    clients.add(ws);
    let isLoggedIn = false;
    let userRole = '';

    ws.on('message', (message) => {
        let data;
        console.log("received message");
        try {
            data = JSON.parse(message);
        } catch {
            sendMessage(ws, 'error', { message: 'Invalid JSON format' });
            return;
        }

        switch (data.action) {
            case 'login':
                handleLogin(data, ws);
                break;
            default:
                if (!isLoggedIn) {
                    sendMessage(ws, 'error', { message: 'Unauthorized access' });
                    return;
                }

                switch (data.action) {
                    case 'fetch_data': fetchAllData(ws); break;
                    case 'create': createRecord(data.table, data.values, ws); break;
                    case 'update': updateRecord(data.table, data.id, data.values, ws); break;
                    case 'delete': deleteRecord(data.table, data.id, ws); break;
                    case 'create_account':
                        if (userRole === 'admin') createAccount(data.username, data.password, data.role, ws);
                        else sendMessage(ws, 'error', { message: 'Permission denied' });
                        break;
                    case 'delete_account':
                        if (userRole === 'admin') deleteAccount(data.username, ws);
                        else sendMessage(ws, 'error', { message: 'Permission denied' });
                        break;
                    case 'get_users':
                        if (userRole === 'admin') getUsers(ws);
                        else sendMessage(ws, 'error', { message: 'Permission denied' });
                        break;
                    default:
                        sendMessage(ws, 'error', { message: 'Unknown action' });
                        break;
                }
                break;
        }
    });

    ws.on('close', () => {
        clients.delete(ws);
        console.log('Client disconnected');
    });
});

// helper function to send structured messages
function sendMessage(ws, type, data) {
    ws.send(JSON.stringify({ type, data }));
}

// login
function handleLogin(data, ws) {
    db.get("SELECT Username, Role FROM Users WHERE Username = ? AND PasswordHash = ?", [data.username, data.password], (err, row) => {
        if (err) {
            sendMessage(ws, 'error', { message: 'Database error' });
        } else if (row) {
            isLoggedIn = true;
            userRole = row.Role;
            sendMessage(ws, 'login_success', { role: userRole });
        } else {
            sendMessage(ws, 'login_failed', {});
        }
    });
}

// fetch all data
function fetchAllData(ws) {
    db.all("SELECT * FROM Landlords", [], (err, landlords) => {
        if (!err) sendMessage(ws, 'landlords_data', landlords);
    });
    db.all("SELECT * FROM Tenants", [], (err, tenants) => {
        if (!err) sendMessage(ws, 'tenants_data', tenants);
    });
    db.all("SELECT * FROM Properties", [], (err, properties) => {
        if (!err) sendMessage(ws, 'properties_data', properties);
    });
    db.all("SELECT * FROM Maintenances", [], (err, maintenances) => {
        if (!err) sendMessage(ws, 'maintenances_data', maintenances);
    });
    db.all("SELECT * FROM QuickLinks", [], (err, quickLinks) => {
        if (!err) sendMessage(ws, 'quicklinks_data', quickLinks);
    });
}

// create record
function createRecord(table, values, ws) {
    const keys = Object.keys(values).join(', ');
    const placeholders = Object.keys(values).map(() => '?').join(', ');
    const sql = `INSERT INTO ${table} (${keys}) VALUES (${placeholders})`;

    db.run(sql, Object.values(values), function (err) {
        if (!err) {
            notifyClients();
            sendMessage(ws, 'create_success', { id: this.lastID });
        } else {
            sendMessage(ws, 'error', { message: 'Failed to create record' });
        }
    });
}

// update record
function updateRecord(table, id, values, ws) {
    const updates = Object.keys(values).map(key => `${key} = ?`).join(', ');
    const sql = `UPDATE ${table} SET ${updates} WHERE rowid = ?`;

    db.run(sql, [...Object.values(values), id], function (err) {
        if (!err) {
            notifyClients();
            sendMessage(ws, 'update_success', {});
        } else {
            sendMessage(ws, 'error', { message: 'Failed to update record' });
        }
    });
}

// delete record
function deleteRecord(table, id, ws) {
    db.run(`DELETE FROM ${table} WHERE rowid = ?`, [id], function (err) {
        if (!err) {
            notifyClients();
            sendMessage(ws, 'delete_success', {});
        } else {
            sendMessage(ws, 'error', { message: 'Failed to delete record' });
        }
    });
}

// create account
function createAccount(username, password, role, ws) {
    db.run("INSERT INTO Users (Username, PasswordHash, Role) VALUES (?, ?, ?)", [username, password, role], function (err) {
        if (!err) {
            notifyClients();
            sendMessage(ws, 'create_account_success', {});
        } else {
            sendMessage(ws, 'error', { message: 'Failed to create account' });
        }
    });
}

// delete account
function deleteAccount(username, ws) {
    db.get("SELECT * FROM Users WHERE Username = ?", [username], (err, row) => {
        if (err || !row) {
            sendMessage(ws, 'error', { message: 'User not found' });
            return;
        }
        db.run("DELETE FROM Users WHERE Username = ?", [username], function (err) {
            if (!err) {
                sendMessage(ws, 'delete_account_success', {});
                notifyClients();
            } else {
                sendMessage(ws, 'error', { message: 'Failed to delete account' });
            }
        });
    });
}

// get users
function getUsers(ws) {
    db.all("SELECT Username, Role FROM Users", [], (err, rows) => {
        if (!err) sendMessage(ws, 'users_data', rows);
        else sendMessage(ws, 'error', { message: 'Database error' });
    });
}

// notify all clients of updates
function notifyClients() {
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            fetchAllData(client);
        }
    });
}

// get local ip
function getLocalIP() {
    const networkInterfaces = os.networkInterfaces();
    for (const interfaceName in networkInterfaces) {
        const interfaces = networkInterfaces[interfaceName];
        for (const interfaceDetails of interfaces) {
            if (interfaceDetails.family === 'IPv4' && !interfaceDetails.internal) {
                return interfaceDetails.address;
            }
        }
    }
    return null;
}

const localIP = getLocalIP();
console.log(`WebSocket server running on ws://${localIP || 'localhost'}:8080`);
