const WebSocket = require('ws');
const os = require('os');
const sqlite3 = require('sqlite3').verbose();

let settings = {
    database_name: 'database.db',
    port: 8080
}

// simple function to make the console prints easier to see if an error or not
function custom_log(is_error, message) {
    console.log(`${is_error ? '[-]' : '[+]'} ${message}`);
}

// connect to the database
const db = new sqlite3.Database(settings.database_name, (err) => {
    custom_log(!!err, err ? 'failed to connect to the database!' : 'successfully connected to the database!');
});

const server = new WebSocket.Server({ port: settings.port });
let clients = new Set();

server.on('connection', (ws) => {
    custom_log(false, 'Client connected');
    clients.add(ws);

    // declare these for each client
    ws.isLoggedIn = false;
    ws.userRole = '';

    ws.on('message', (message) => {
        let data;
        try {
            data = JSON.parse(message);
            custom_log(false, "Message received: " + message); // remove on release version
        } catch {
            sendMessage(ws, 'error', { message: 'Invalid JSON format' });
            return;
        }

        switch (data.action) {
            case 'login':
                handleLogin(data, ws);
                break;
            default:
                if (!ws.isLoggedIn) {
                    sendMessage(ws, 'error', { message: 'Unauthorized access' });
                    return;
                }

                switch (data.action) {
                    case 'fetch_data': fetchAllData(ws); break;
                    case 'create': createRecord(data.table, data.values, ws); break;
                    case 'update': updateRecord(data.table, data.id, data.values, ws); break;
                    case 'delete': deleteRecord(data.table, data.id, ws); break;
                    case 'create_account':
                        if (ws.userRole === 'admin') createAccount(data.username, data.password, data.role, ws);
                        else sendMessage(ws, 'error', { message: 'Permission denied' });
                        break;
                    case 'delete_account':
                        if (ws.userRole === 'admin') deleteAccount(data.username, ws);
                        else sendMessage(ws, 'error', { message: 'Permission denied' });
                        break;
                    case 'update_password':
                        if (ws.userRole === 'admin') updatePassword(data.username, data.password, ws);
                        else sendMessage(ws, 'error', { message: 'Permission denied' });
                        break;
                    case 'get_users':
                        if (ws.userRole === 'admin') getUsers(ws);
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

        // clear client data on close
        ws.isLoggedIn = false;
        ws.userRole = '';
        
        custom_log(true, 'Client disconnected');
    });
});

// helper function just makes it easier to do communication
function sendMessage(ws, type, data) {
    const message = JSON.stringify({ type, data });
    ws.send(message);
    custom_log(false, "Message sent: " + message); // remove on release 
}

// login
function handleLogin(data, ws) {
    db.get("SELECT Username, Role FROM Users WHERE Username = ? AND PasswordHash = ?", [data.username, data.password], (err, row) => {
        if (err) {
            sendMessage(ws, 'error', { message: 'Database error' });
        } else if (row) {
            ws.isLoggedIn = true;
            ws.userRole = row.Role;
            sendMessage(ws, 'login_success', { username: row.Username, role: row.Role });
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

                            
// needs admin to be able to call functions bellow

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

// update password
function updatePassword(username, password, ws) {
    db.get("SELECT * FROM Users WHERE Username = ?", [username], (err, row) => {
        if (err || !row) {
            sendMessage(ws, 'error', { message: 'User not found' });
            return;
        }
        db.run("UPDATE Users SET PasswordHash = ? WHERE Username = ?", [password, username], function (err) {
            if (!err) {
                sendMessage(ws, 'update_password_success', {});
                notifyClients();
            } else {
                sendMessage(ws, 'error', { message: 'Failed to update account' });
            }
        });
    });
}

// send users to client 
function getUsers(ws) {
    db.all("SELECT Username, Role FROM Users", [], (err, rows) => {
        if (!err) sendMessage(ws, 'users_data', rows);
        else sendMessage(ws, 'error', { message: 'Database error' });
    });
}


// can't be called from client at any point will be a response to database update

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
custom_log(false, `server running at ws://${localIP || 'localhost'}:${settings.port}`);
