const WebSocket = require('ws');
const os = require('os');
const sqlite3 = require('sqlite3').verbose();

// for easier to change settings
let settings = {
    databaseName: 'database.db', 
    port: 8080
}

// for easier to see console prints and improves the visual aspect of it
function customLog(isError, message) {
    let start = '';

    if (isError){
        start = '[-] '
    }else{
        start = '[+] '
    }

    console.log(`${start} ${message}`);
}

// for the connection to the database makes the connection to the db
const db = new sqlite3.Database(settings.databaseName, (err) => {
    if (err) {
        customLog(true, 'failed to connect to the database!');
    } else {
        customLog(false, 'successfully connected to the database!');
    }
});

// for setting up the web socket server
const server = new WebSocket.Server({ port: settings.port });
let clients = new Set();

// for connection handling clients
server.on('connection', (ws) => {
    customLog(false, 'Client connected');
    clients.add(ws);

    // making these variables for each client so it admins and agents have the right privlages
    ws.isLoggedIn = false;
    ws.userRole = '';

    // handling client messages
    ws.on('message', (message) => {
        let data;

        // if its not a json can cause the server to crash so added in this to handle it
        try {
            data = JSON.parse(message);
        } catch {
            sendMessage(ws, 'error', { message: 'Invalid JSON format' });
            return;
        }

        // swtich case because its better than lots of if statments
        switch (data.action) {
            case 'login':
                handleLogin(data, ws);
                break;
            default:
                // check if logged in when sending a request to stop none authed clients from doing anything or getting data
                if (!ws.isLoggedIn) { 
                    sendMessage(ws, 'error', { message: 'Unauthorized access' });
                    return;
                }

                // using data.action to decide what function they want to call from the server
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
        // clean up
        ws.isLoggedIn = false;
        ws.userRole = '';
        clients.delete(ws);
        
        customLog(true, 'Client disconnected');
    });
});

// for making sending messages to client easier
function sendMessage(ws, type, data) {
    const message = JSON.stringify({ type, data });
    ws.send(message);
}

// for handling the login request
function handleLogin(data, ws) {
    db.get("SELECT Username, Role FROM Users WHERE Username = ? AND PasswordHash = ?", [data.username, data.password], (err, row) => {
        // catching error if cant access database doing this to stop the db from crashing
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

// for fetching all data that the users would need (not info about users as only admins would need that)
function fetchAllData(ws) {
    db.all("SELECT * FROM Landlords", [], (err, landlords) => { // all these are the same just diffrent tables * for all and will only send if no error
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
    db.all("SELECT * FROM Rents", [], (err, rents) => {
        if (!err) sendMessage(ws, 'rents_data', rents);
    });
    db.all("SELECT * FROM QuickLinks", [], (err, quickLinks) => {
        if (!err) sendMessage(ws, 'quicklinks_data', quickLinks);
    });
}

// for creating a record 
function createRecord(table, values, ws) {
    const keys = Object.keys(values).join(', ');
    const placeholders = Object.keys(values).map(() => '?').join(', ');
    const sql = `INSERT INTO ${table} (${keys}) VALUES (${placeholders})`;

    db.run(sql, Object.values(values), function (err) {
        if (!err) {
            notifyClients(); // updates all clients
            sendMessage(ws, 'create_success', { id: this.lastID });
        } else {
            sendMessage(ws, 'error', { message: 'Failed to create record' });
        }
    });
}

// for updateing record
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

// for deleting a record
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

// for creating a account
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

// for deleting account
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

// for updating password
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

// send users to admin privlage client 
function getUsers(ws) {
    db.all("SELECT Username, Role FROM Users", [], (err, rows) => { // only send username and role DO NOT SEND HASHED PASSWORDS
        if (!err) sendMessage(ws, 'users_data', rows);
        else sendMessage(ws, 'error', { message: 'Database error' });
    });
}


// can't be called from client at any point will be a response to database update

// runs function fetchAllData for all clients updating there data for them
function notifyClients() {
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            fetchAllData(client);
        }
    });
}

// get local ip of the devices where server is being ran
function getLocalIP() {
    const networkInterfaces = os.networkInterfaces();

    for (const interfaceName in networkInterfaces) {
        const interfaces = networkInterfaces[interfaceName];
        for (const interfaceDetails of interfaces) 
        {
            if (interfaceDetails.family === 'IPv4' && !interfaceDetails.internal) 
            {
                return interfaceDetails.address;
            }
        }
    }
    return null;
}

const localIP = getLocalIP();
customLog(false, `server running at ws://${localIP || 'localhost'}:${settings.port}`); // if localIP is null will just show localhost instead
