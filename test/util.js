/**
 *
 * @param {import('http').Server} servers
 * @returns {Promise<void>}
 */
export async function waitForClosed(...servers) {
    return new Promise((resolve, reject) => {
        let count = 0;
        servers.forEach((server) => {
            server.addListener('close', () => {
                count++;
                if (count === servers.length) {
                    resolve();
                }
            });
        });

        // Throw after 15 seconds.
        setTimeout(() => {
            reject(
                `All servers have not finished closing.  Only ${count} out of ${servers.length} have closed.`,
            );
        }, 1000 * 15);
    });
}
