import React, { useEffect, useState } from "react";

// Componente principale del minigioco B - Torre del Volume.
const MinigiocoB = ({ leaveGame, socket, isFirstPlayer, peerId, onGameResult }) => {
  // Stato per i blocchi visibili nella torre del giocatore.
  const [visibleBlocks, setVisibleBlocks] = useState(0);

  // Countdown prima dell'inizio del gioco.
  const [countdown, setCountdown] = useState(3);

  // Flag che indica se il gioco è iniziato.
  const [gameStarted, setGameStarted] = useState(false);

  // Livello audio attuale misurato dal microfono.
  const [audioLevel, setAudioLevel] = useState(0);

  // Flag per capire se il gioco è terminato.
  const [gameEnded, setGameEnded] = useState(false);

  // Blocchi (punteggio) dell'avversario.
  const [opponentBlocks, setOpponentBlocks] = useState(null);

  // Punteggio del giocatore locale.
  const [myScore, setMyScore] = useState(0);

  // Punteggio dell'avversario (duplicato per confronto).
  const [opponentScore, setOpponentScore] = useState(0);

  // Evita che il risultato venga gestito due volte.
  const [resultHandled, setResultHandled] = useState(false);

  // 1. Effetto per il conto alla rovescia iniziale.
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      setGameStarted(true); // Avvia il gioco quando il countdown arriva a 0.
    }
  }, [countdown]);

  // 2, Effetto principale che cattura l'audio e misura il volume
  useEffect(() => {
    if (gameStarted && !gameEnded) {
      navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        const audioCtx = new AudioContext();
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        let volumeSum = 0;
        let sampleCount = 0;

        const readVolume = () => {
          analyser.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          setAudioLevel(Math.round(avg));
          volumeSum += avg;
          sampleCount++;

          // Mappa il volume da 0–255 a 0–10 blocchi.
          const blocks = Math.min(10, Math.floor(avg / 6));
          setVisibleBlocks(blocks);
        };

        // Legge il volume ogni 200ms.
        const interval = setInterval(readVolume, 200);

        // Dopo 5 secondi finisce il gioco.
        setTimeout(() => {
          clearInterval(interval);
          stream.getTracks().forEach((track) => track.stop());
          setGameEnded(true);

          const finalAvg = volumeSum / sampleCount;
          const finalBlocks = Math.min(10, Math.floor(finalAvg / 6));
          setVisibleBlocks(finalBlocks);

          const newScore = finalBlocks;
          setMyScore(newScore);

          // Invia il risultato all'avversario via socket.
          if (socket && peerId) {
            socket.emit("volume_game_result", { to: peerId, blocks: newScore });
          }
        }, 5000);
      }).catch(error => {
        console.error("Errore nell'accesso al microfono:", error);
        setGameEnded(true);
      });
    }
  }, [gameStarted, socket, peerId, gameEnded]);

  // Riceve i risultati dell'avversario e gestisce il confronto.
  useEffect(() => {
    if (!socket) return;

    const handleVolumeGameResult = ({ blocks }) => {
      setOpponentBlocks(blocks);
      setOpponentScore(blocks);
      
      if (gameEnded && myScore > 0) {
        evaluateResult(myScore, blocks);
      }
    };

    const handleVolumeGameEnd = ({ result }) => {
      setGameEnded(true);
      
      if (!isFirstPlayer && !resultHandled && result !== "draw") {
        setResultHandled(true);
        if (onGameResult) {
          onGameResult(result);
        }
      }
    };

    socket.on("volume_game_result", handleVolumeGameResult);
    socket.on("volume_game_end", handleVolumeGameEnd);

    return () => {
      socket.off("volume_game_result", handleVolumeGameResult);
      socket.off("volume_game_end", handleVolumeGameEnd);
    };
  }, [socket, gameEnded, myScore, onGameResult, isFirstPlayer, resultHandled]);

  // Se siamo il primo giocatore, valutiamo il risultato quando entrambi hanno finito.
  useEffect(() => {
    if (gameEnded && myScore > 0 && opponentBlocks !== null && !resultHandled && isFirstPlayer) {
      evaluateResult(myScore, opponentBlocks);
    }
  }, [gameEnded, myScore, opponentBlocks, resultHandled, isFirstPlayer]);

  // Determina il risultato della partita.
  const evaluateResult = (myScore, opponentScore) => {
    setResultHandled(true);
    
    let result;
    if (myScore > opponentScore) result = "win";
    else if (myScore < opponentScore) result = "lose";
    else result = "draw";

    // Se siamo il primo giocatore e non è pareggio, inviamo il risultato anche all'altro.
    if (isFirstPlayer && result !== "draw") {
      if (onGameResult) {
        onGameResult(result);
      }
      
      if (socket && peerId) {
        try {
          const opponentResult = result === "win" ? "lose" : "win";
          socket.emit("volume_game_end", { to: peerId, result: opponentResult });
        } catch (error) {
          console.error("Errore nell'invio del risultato:", error);
        }
      }
    }
  };

  // Rende graficamente la torre del giocatore.
  const renderTower = () => {
    const blocks = [];
    for (let i = 0; i < 10; i++) {
      blocks.push(
        <div
          key={i}
          className="block"
          style={{
            width: "60px",
            height: "30px",
            backgroundColor: i < visibleBlocks ? "#a855f7" : "#e5e7eb",
            opacity: i < visibleBlocks ? 1 : 0.3,
            margin: "5px 0",
            borderRadius: "6px",
            transition: "all 0.3s ease"
          }}
        />
      );
    }
    return blocks.reverse(); // Dalla base verso l'alto.
  };

  // Rende graficamente la torre dell'avversario.
  const renderOpponentTower = () => {
    if (opponentBlocks === null) return null;

    const blocks = [];
    for (let i = 0; i < 10; i++) {
      blocks.push(
        <div
          key={i}
          className="block"
          style={{
            width: "60px",
            height: "30px",
            backgroundColor: i < opponentBlocks ? "#f43f5e" : "#e5e7eb",
            opacity: i < opponentBlocks ? 1 : 0.3,
            margin: "5px 0",
            borderRadius: "6px"
          }}
        />
      );
    }
    return blocks.reverse();
  };

  // Render del componente.
  return (
    <div style={{ textAlign: "center" }}>
      <h2>🎤 Minigioco B - Torre del Volume</h2>

      {/* Countdown iniziale */}
      {!gameStarted && !gameEnded ? (
        <h1 style={{ fontSize: "60px", fontWeight: "bold", marginTop: "40px" }}>
          {countdown === 0 ? "VIA!" : countdown}
        </h1>
      ) : (
        <>
          {/* Mostra il livello audio durante il gioco */}
          {!gameEnded && <p>Intensità attuale: {audioLevel}</p>}

          {/* Torri del giocatore e dell’avversario */}
          <div style={{ display: "flex", justifyContent: "center", gap: "30px", marginTop: "30px" }}>
            <div>
              <h3>La tua torre</h3>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                {renderTower()}
              </div>
              {gameEnded && <p>Blocchi: {myScore}/10</p>}
            </div>

            {opponentBlocks !== null && (
              <div>
                <h3>Avversario</h3>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  {renderOpponentTower()}
                </div>
                <p>Blocchi: {opponentBlocks}/10</p>
              </div>
            )}
          </div>

          {/* Risultato finale */}
          {gameEnded && (
            <div className="fireworks-container" style={{ marginTop: "20px" }}>
              {myScore > opponentScore && (
                <div className="fireworks" style={{ fontSize: "30px", marginBottom: "10px" }}>🎆🎇✨</div>
              )}
              <h3 style={{ marginTop: "10px" }}>Minigioco completato!</h3>
              <div className="message" style={{ fontSize: "25px", fontWeight: "bold" }}>
                {myScore > opponentScore ? "Hai vinto!" : (myScore < opponentScore ? "Hai perso!" : "Pareggio!")}
              </div>
            </div>
          )}
        </>
      )}
      
      {/* Pulsante per uscire dal gioco */}
      {gameEnded && (
        <button onClick={leaveGame} style={{
          marginTop: "20px",
          padding: "8px 16px",
          borderRadius: "8px",
          background: "#6b46c1",
          color: "white",
          border: "none",
          cursor: "pointer"
        }}>
          Esci dal minigioco
        </button>
      )}
    </div>
  );
};

export default MinigiocoB;
