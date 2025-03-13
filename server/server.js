const WebSocket = require('ws');
const os = require('os');

// temp data will implement grabbing data from db
const users = {
    admin: { password: 'adminpass', role: 'admin' },
    user: { password: 'userpass', role: 'user' }
};

const server = new WebSocket.Server({ port: 8080 });

server.on('connection', (ws) => {
    console.log('Client connected');

    let isLoggedIn = false;
    let userRole = '';

    ws.on('message', (message) => {
        console.log(`Received: ${message}`);

        // Convert message to string if it's a buffer
        const messageStr = message.toString();

        if (!isLoggedIn) {
            const [username, password] = messageStr.split(':');
            if (users[username] && users[username].password === password) {
                isLoggedIn = true;
                userRole = users[username].role;
                ws.send(`Login successful! You are logged in as ${userRole}.`);
            } else {
                ws.send('Invalid credentials. Please log in again.');
            }
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
    });
});

const networkInterfaces = os.networkInterfaces();
let localIP = '';
for (const interfaceName in networkInterfaces) {
    networkInterfaces[interfaceName].forEach((interfaceDetails) => {
        if (interfaceDetails.family === 'IPv4' && !interfaceDetails.internal) {
            localIP = interfaceDetails.address;
        }
    });
}

console.log('WebSocket server running on ws://' + localIP + ':8080');
