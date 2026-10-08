import type { Server } from "socket.io";

// The jobs process has no socket server. Broadcasts made there (such as messages AI
// players send during a tick) are dropped; players see them when chat reloads.
const broadcasterStub = {
    emit: (...args: any[]) => {},
};

export const serverStub = {
    on: (...args: any[]) => {},
    engine: { on: (...args: any[]) => {} },
    to: (...args: any[]) => broadcasterStub,
    emit: (...args: any[]) => {},
} as unknown as Server;
