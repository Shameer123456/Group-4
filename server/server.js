const WebSocket = require('ws');
const os = require('os');
const sqlite3 = require('sqlite3').verbose();

// connection to the db (need to change name to what the db is actually called in the future)
const db = new sqlite3.Database('database.db', (err) => {
    if (err) {
        console.error('Database connection error:', err.message);
    } else {
        console.log('Connected to SQLite database.');
    }
});

// set port of the server
const server = new WebSocket.Server({ port: 8080 });

let clients = new Set();

// handles communication and requests
server.on('connection', (ws) => {
    console.log('Client connected');
    clients.add(ws);
    let isLoggedIn = false;
    let userRole = '';

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        if (data.action === 'login') {
            db.get("SELECT Username, Role FROM Users WHERE Username = ? AND PasswordHash = ?", [data.username, data.password], (err, row) => {
                if (err) {
                    ws.send(JSON.stringify({ error: 'Database error' }));
                } else if (row) {
                    isLoggedIn = true;
                    userRole = row.Role;
                    ws.send(JSON.stringify({ success: 'Login successful', role: userRole }));
                } else {
                    ws.send(JSON.stringify({ error: 'Invalid credentials' }));
                }
            });
        }

        if (isLoggedIn) {
            switch (data.action) {
                case 'fetch_data':
                    fetchAllData(ws);
                    break;
                case 'create':
                    createRecord(data.table, data.values, ws);
                    break;
                case 'update':
                    updateRecord(data.table, data.id, data.values, ws);
                    break;
                case 'delete':
                    deleteRecord(data.table, data.id, ws);
                    break;
                case 'create_account':
                    if (userRole === 'admin') {
                        createAccount(data.username, data.password, data.role, ws);
                    } else {
                        ws.send(JSON.stringify({ error: 'Permission denied' }));
                    }
                    break;
                case 'delete_account':
                    if (userRole === 'admin') {
                        deleteAccount(data.username, ws); 
                    } else {
                        ws.send(JSON.stringify({ error: 'Permission denied' }));
                    }
                    break;
                case 'get_users':
                    if (userRole === 'admin') {
                        getUsers(ws);  // Get all users if the user is an admin
                    } else {
                        ws.send(JSON.stringify({ error: 'Permission denied' }));
                    }
                    break;
            }
        }
    });

    ws.on('close', () => {
        clients.delete(ws);
        console.log('Client disconnected');
    });
});

// handling fetching of the data (should work fine)
function fetchAllData(ws) {
    db.all("SELECT * FROM Landlords", [], (err, landlords) => {
        if (!err) {
            ws.send(JSON.stringify({ landlords }));
        }
    });
    db.all("SELECT * FROM Tenants", [], (err, tenants) => {
        if (!err) {
            ws.send(JSON.stringify({ tenants }));
        }
    });
    db.all("SELECT * FROM Properties", [], (err, properties) => {
        if (!err) {
            ws.send(JSON.stringify({ properties }));
        }
    });
    db.all("SELECT * FROM Maintenance", [], (err, maintenance) => {
        if (!err) {
            ws.send(JSON.stringify({ maintenance }));
        }
    });
    db.all("SELECT * FROM QuickLinks", [], (err, quickLinks) => {
        if (!err) {
            ws.send(JSON.stringify({ quickLinks }));
        }
    });
}

// handling creation of records
function createRecord(table, values, ws) {
    const keys = Object.keys(values).join(', ');
    const placeholders = Object.keys(values).map(() => '?').join(', ');
    const sql = `INSERT INTO ${table} (${keys}) VALUES (${placeholders})`;

    db.run(sql, Object.values(values), function (err) {
        if (!err) {
            notifyClients();
            ws.send(JSON.stringify({ success: 'Record created', id: this.lastID }));
        } else {
            ws.send(JSON.stringify({ error: 'Failed to create record' }));
        }
    });
}

// handling updating of records
function updateRecord(table, id, values, ws) {
    const updates = Object.keys(values).map(key => `${key} = ?`).join(', ');
    const sql = `UPDATE ${table} SET ${updates} WHERE rowid = ?`;

    db.run(sql, [...Object.values(values), id], function (err) {
        if (!err) {
            notifyClients();
            ws.send(JSON.stringify({ success: 'Record updated' }));
        } else {
            ws.send(JSON.stringify({ error: 'Failed to update record' }));
        }
    });
}

// handling deletion of records
function deleteRecord(table, id, ws) {
    const sql = `DELETE FROM ${table} WHERE rowid = ?`;
    db.run(sql, [id], function (err) {
        if (!err) {
            notifyClients();
            ws.send(JSON.stringify({ success: 'Record deleted' }));
        } else {
            ws.send(JSON.stringify({ error: 'Failed to delete record' }));
        }
    });
}

// handling account creation
function createAccount(username, password, role, ws) {
    const sql = "INSERT INTO Users (Username, PasswordHash, Role) VALUES (?, ?, ?)";
    db.run(sql, [username, password, role], function (err) {
        if (!err) {
            notifyClients();
            ws.send(JSON.stringify({ success: 'Account created' }));
        } else {
            ws.send(JSON.stringify({ error: 'Failed to create account' }));
        }
    });
}

// handling account deletion
function deleteAccount(username, ws) {
    if (userRole !== 'admin') {
        ws.send(JSON.stringify({ error: 'Permission denied' }));
        return;
    }

    db.get("SELECT * FROM Users WHERE Username = ?", [username], (err, row) => {
        if (err) {
            ws.send(JSON.stringify({ error: 'Database error' }));
            return;
        }

        if (!row) {
            ws.send(JSON.stringify({ error: 'User not found' }));
            return;
        }

        const sql = "DELETE FROM Users WHERE Username = ?";
        db.run(sql, [username], function (err) {
            if (!err) {
                ws.send(JSON.stringify({ success: 'Account deleted' }));
                notifyClients(); 
            } else {
                ws.send(JSON.stringify({ error: 'Failed to delete account' }));
            }
        });
    });
}

// get users
function getUsers(ws) {
    db.all("SELECT Username, Role FROM Users", [], (err, rows) => {
        if (err) {
            ws.send(JSON.stringify({ error: 'Database error' }));
        } else {
            ws.send(JSON.stringify({ users: rows }));
        }
    });
}

// handlining sending message to all clients
function notifyClients() {
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            fetchAllData(client);
        }
    });
}

// get ip address 
function getLocalIP() {
    const networkInterfaces = os.networkInterfaces();
    for (const interfaceName in networkInterfaces) {
        const interfaces = networkInterfaces[interfaceName];
        for (const interfaceDetails of interfaces) {
            if (
                interfaceDetails.family === 'IPv4' && 
                !interfaceDetails.internal
            ) {
                return interfaceDetails.address;
            }
        }
    }
    return null;
}

const localIP = getLocalIP();

// console print the ip of server
if (localIP) {
    console.log(`WebSocket server running on ws://${localIP}:8080`);
} else {
    console.log('Could not determine the local IP address.');
}
