let port = 8300;

export function getPort() {
    return port++;
}

let servers = [];

export async function stopServers() {
    for (let server of servers) {
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
    }
}

export function setServers(...args) {
    servers = args;
}
