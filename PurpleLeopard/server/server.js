const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());

app.use(express.static(path.join(__dirname, "..", "frontend", "dist")));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

io.on("connection", (socket) => {
  console.log("Nuovo utente connesso:", socket.id);
  socket.emit("me", socket.id); //0.

  socket.on("callUser", ({ userToCall, signalData, from }) => { //1.1
    io.to(userToCall).emit("callUser", { signal: signalData, from });
  });

  socket.on("answerCall", ({ signal, to }) => {  //1.2
    io.to(to).emit("callAccepted", signal);
  });

  socket.on("startGameRequest", ({ to, game }) => {
    io.to(to).emit("receiveGameRequest", { from: socket.id, game });
  });

  socket.on("acceptGameRequest", ({ to, game }) => {
    io.to(to).emit("gameStartConfirmed", { game });
  });

  socket.on("leaveGame", ({ to }) => {
    io.to(to).emit("gameEnded");
  });

  socket.on("memory_init", ({ to, layout }) => {
    io.to(to).emit("memory_init", layout);
  });

  socket.on("memory_flip", ({ to, index }) => {
    io.to(to).emit("memory_flip", index);
  });

  socket.on("memory_match", ({ to, matched }) => {
    io.to(to).emit("memory_match", { matched });
  });

  socket.on("memory_unflip", ({ to, indexes }) => {
    io.to(to).emit("memory_unflip", { indexes });
  });

  socket.on("memory_turn", ({ to }) => {
    io.to(to).emit("memory_turn");
  });

  socket.on("memory_score", ({ to, score }) => {
    io.to(to).emit("memory_score", { score });
  });

  socket.on("memory_game_result", ({ to, result }) => {
    console.log(`Inviando risultato del gioco memory a ${to}: ${result}`);
    io.to(to).emit("memory_game_result", { result });
  });

  socket.on("volume_game_result", ({ to, blocks }) => {
    io.to(to).emit("volume_game_result", { blocks });
  });

  socket.on("volume_game_score", ({ to, result }) => {
    console.log(`Inviando risultato del gioco volume a ${to}: ${result}`);
    io.to(to).emit("volume_game_score", { result });
  });

  socket.on("volume_game_end", ({ to, result }) => {
    console.log(`Inviando risultato finale del gioco volume a ${to}: ${result}`);
    io.to(to).emit("volume_game_end", { result });
  });

  socket.on("disconnect", () => {
    console.log("Utente disconnesso:", socket.id);
  });
  socket.on("volume_game_start", ({ to, readyTime }) => {
    io.to(to).emit("volume_game_start", { readyTime });
  });

  socket.on("volume_game_end", ({ to, result }) => {
    io.to(to).emit("volume_game_end", { result });
  });

  socket.on("reaction_game_result", ({ to, time }) => {
    io.to(to).emit("reaction_game_result", { time });
  });

  socket.on("reaction_game_end", ({ to, result }) => {
    io.to(to).emit("reaction_game_end", { result });
  });
  
  socket.on("ice-candidate", ({ to, candidate }) => {
    io.to(to).emit("ice-candidate", { candidate });
  });
  
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "dist", "index.html"));
});

server.listen(4000, () => console.log("Server avviato sulla porta 4000"));