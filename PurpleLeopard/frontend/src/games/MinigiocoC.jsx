import React, { useEffect, useState, useRef } from "react";

// Componente principale del minigioco C.
const MinigiocoC = ({ leaveGame, socket, isFirstPlayer, peerId, onGameResult }) => {
  // Countdown prima dell'inizio del duello.
  const [countdown, setCountdown] = useState(3);

  // Flag che indica se il gioco è iniziato.
  const [gameStarted, setGameStarted] = useState(false);

  // Momento esatto in cui il giocatore può sparare.
  const [shootTimestamp, setShootTimestamp] = useState(null);

  // Tempo di reazione del giocatore.
  const [reactionTime, setReactionTime] = useState(null);

  // Tempo di reazione dell'avversario.
  const [opponentTime, setOpponentTime] = useState(null);

  // Flag per sapere se il gioco è terminato.
  const [gameEnded, setGameEnded] = useState(false);

  // Per evitare di inviare più volte il risultato.
  const [resultHandled, setResultHandled] = useState(false);

  // Riferimento all’elemento audio per il suono dello sparo.
  const shootSound = useRef(null);

  //1. Countdown iniziale prima di mostrare "SPARA ORA!".
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown((prev) => prev - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      // Quando il countdown arriva a 0, il gioco parte.
      setGameStarted(true);
      setShootTimestamp(Date.now()); // Salva il momento in cui sparare è valido.
      console.log("[SPARA ORA] Timestamp partito:", Date.now());
    }
  }, [countdown]);

  //2. Funzione chiamata quando il giocatore clicca "SPARA!"
  const handleShoot = () => {
    // Non fare nulla se il gioco non è ancora iniziato o se si è già sparato.
    if (!shootTimestamp || reactionTime !== null) return;

    // Riproduce il suono dello sparo.
    if (shootSound.current) {
      shootSound.current.currentTime = 0; 
      shootSound.current.play().catch(e => console.log("Errore riproduzione audio:", e));
    }

    // Calcola tempo di reazione (in millisecondi).
    const myTime = Date.now() - shootTimestamp;
    setReactionTime(myTime);
    console.log("[CLICK] Tempo reazione:", myTime);

    // Invia il tempo all'avversario tramite socket.
    if (socket && peerId) {
      socket.emit("reaction_game_result", { to: peerId, time: myTime });
    }

    // Se l'avversario ha già sparato e sei il primo giocatore, valuta il risultato.
    if (opponentTime !== null && !resultHandled && isFirstPlayer) {
      evaluateResult(myTime, opponentTime);
    }
  };

  // Riceve il tempo dell'avversario o il risultato finale tramite socket.
  useEffect(() => {
    if (!socket) return;

    // Riceve il tempo dell'avversario
    const handleReactionResult = ({ time }) => {
      console.log("[SOCKET] Ricevuto tempo avversario:", time);
      setOpponentTime(time);

      if (reactionTime !== null && !resultHandled && isFirstPlayer) {
        evaluateResult(reactionTime, time);
      }
    };

    // Riceve il risultato finale se non sei il primo giocatore.
    const handleReactionEnd = ({ result }) => {
      console.log("[SOCKET] Risultato finale:", result);
      setGameEnded(true);
      if (!isFirstPlayer && !resultHandled) {
        setResultHandled(true);
        if (onGameResult) onGameResult(result);
      }
    };

    socket.on("reaction_game_result", handleReactionResult);
    socket.on("reaction_game_end", handleReactionEnd);

    return () => {
      socket.off("reaction_game_result", handleReactionResult);
      socket.off("reaction_game_end", handleReactionEnd);
    };
  }, [socket, reactionTime, resultHandled, isFirstPlayer, onGameResult]);

  // Quando entrambi hanno sparato, valuta il vincitore (solo il primo giocatore lo fa).
  useEffect(() => {
    if (
      reactionTime !== null &&
      opponentTime !== null &&
      !resultHandled &&
      isFirstPlayer
    ) {
      evaluateResult(reactionTime, opponentTime);
    }
  }, [reactionTime, opponentTime, resultHandled, isFirstPlayer]);

  // Funzione che calcola il risultato del duello.
  const evaluateResult = (me, opponent) => {
    setResultHandled(true);
    setGameEnded(true);

    let result;
    if (me < opponent) result = "win";
    else if (me > opponent) result = "lose";
    else result = "draw";

    console.log("[VALUTO] Io:", me, "| Avversario:", opponent, "→", result);

    // Se sei il primo, invia il risultato all'altro giocatore (invertito).
    if (isFirstPlayer && socket && peerId && result !== "draw") {
      socket.emit("reaction_game_end", {
        to: peerId,
        result: result === "win" ? "lose" : "win",
      });
    }

    // Comunica il risultato anche al componente genitore.
    if (onGameResult) onGameResult(result);
  };

  return (
    <div style={{ textAlign: "center", padding: "20px" }}>
      {/* Suono dello sparo */}
      <audio ref={shootSound} src="/sparo.mp3" preload="auto" />
      
      <h2>⚡ Minigioco C – Duello di Reazione</h2>

      {/* Countdown prima che il giocatore possa sparare */}
      {!gameStarted && !gameEnded ? (
        <h1 style={{ fontSize: "60px", fontWeight: "bold", marginTop: "40px" }}>
          {countdown === 0 ? "VIA!" : countdown}
        </h1>
      ) : (
        <>
          {/* Mostra il pulsante "SPARA!" solo se non hai ancora sparato */}
          {reactionTime === null && !gameEnded && (
            <>
              <h3 style={{ color: "green", fontSize: "2rem" }}>SPARA ORA!</h3>
              <button
                onClick={handleShoot}
                style={{
                  fontSize: "1.5rem",
                  padding: "10px 20px",
                  marginTop: "20px",
                  backgroundColor: "#10b981",
                  color: "white",
                  border: "none",
                  borderRadius: "5px",
                  cursor: "pointer",
                  transition: "transform 0.1s",
                }}
                // Effetti di pressione estetici
                onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.95)")}
                onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
                onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
              >
                SPARA!
              </button>
            </>
          )}

          {/* Mostra il risultato finale */}
          {gameEnded && (
            <div style={{ marginTop: "20px" }}>
              <h3>
                {reactionTime < opponentTime
                  ? "🏆 Hai vinto!"
                  : reactionTime > opponentTime
                  ? "😢 Hai perso!"
                  : "😐 Pareggio!"}
              </h3>
              <p>Il tuo tempo: {reactionTime} ms</p>
              <p>Avversario: {opponentTime} ms</p>
            </div>
          )}
        </>
      )}

      {/* Bottone per uscire dal gioco una volta finito */}
      {gameEnded && (
        <button
          onClick={leaveGame}
          style={{
            marginTop: "20px",
            padding: "10px 20px",
            backgroundColor: "red",
            color: "white",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer",
          }}
        >
          Esci dal minigioco
        </button>
      )}
    </div>
  );
};

export default MinigiocoC;
