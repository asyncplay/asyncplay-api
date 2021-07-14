import { createServer } from "http";
import { Server, Socket } from "socket.io";

const httpServer = createServer();
const io = new Server(httpServer, {
  path: "/socket",
  pingTimeout: 10000,
});

type RoomType = { file: { length: number }; wait: string[] };

const rooms: { [key: string]: RoomType } = {};

interface ISocket extends Socket {
  username?: string;
}

io.on("connection", (socket: ISocket) => {
  socket.on("client/set-username", (username) => {
    socket.username = username;
  });

  // create room if doesn't exist
  socket.on("client/join", (roomId) => {
    if (!rooms[roomId]) rooms[roomId] = { file: { length: 0 }, wait: [] };
    socket.join(roomId);
    socket.emit("server/join", roomId, rooms[roomId]); // ack
  });

  socket.on("client/leave", (roomId) => {
    socket.leave(roomId);
    socket.emit("server/leave", roomId); // ack
  });

  socket.on("client/message", (message, roomId) => {
    socket.to(roomId).emit("server/message", message, socket.id);
  });

  // user updates the room file
  // notify all room members that file is updated
  // other users now should send set-ready
  socket.on("client/file-update", (file, roomId) => {
    rooms[roomId].file = file;
    socket.to(roomId).emit("server/file-update", file, socket.id);
  });

  // user emits this when
  // 1. joins a room
  // 2. selects a file
  // user then sends set-ready based on ack
  socket.on("client/file-match", (file, roomId) => {
    socket.emit("server/file-match", rooms?.[roomId]?.file === file);
  });

  // user emits this on
  // 1. server/file-match response
  // 2. server/file-update response
  // if the file didn't match -> user emits not ready
  // if the file matches -> user emits ready
  socket.on("client/set-ready", (ready, roomId) => {
    const prevWait = [...rooms[roomId].wait];
    if (!ready) {
      rooms[roomId].wait.push(socket.id);
    } else {
      rooms[roomId].wait = rooms[roomId].wait.filter(
        (sid) => sid !== socket.id
      );
    }
    const currWait = rooms[roomId].wait;
    if (prevWait !== currWait) {
      socket
        .to(roomId)
        .emit("server/users-ready", currWait.length === 0, currWait);
    }
  });

  socket.on("disconnecting", (reason) => {
    for (const roomId of socket.rooms) {
      if (roomId !== socket.id) {
        socket.to(roomId).emit("user-left", socket.id);
      }
    }
  });

  socket.on("disconnect", (reason) => {
    console.log(reason);
  });
});

httpServer.listen(5000);