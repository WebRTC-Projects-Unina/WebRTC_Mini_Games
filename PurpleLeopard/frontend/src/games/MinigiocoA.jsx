import React, { useEffect, useState } from "react";

// Componente principale del minigioco.
const MinigiocoA = ({ leaveGame, socket, isFirstPlayer, peerId, onGameResult }) => {
  // Stato del layout delle carte.
  const [cards, setCards] = useState([]);

  // Stato per le carte attualmente selezionate (massimo 2).
  const [selectedCards, setSelectedCards] = useState([]);

  // Flag che indica se è il turno del giocatore locale.
  const [isMyTurn, setIsMyTurn] = useState(false);

  // Carte già indovinate (indici).
  const [matchedCards, setMatchedCards] = useState([]);

  // Punteggio locale.
  const [myScore, setMyScore] = useState(0);

  // Punteggio avversario.
  const [opponentScore, setOpponentScore] = useState(0);

  // Fine del gioco.
  const [gameEnded, setGameEnded] = useState(false);

  // Flag per evitare invii multipli del risultato.
  const [resultHandled, setResultHandled] = useState(false);

  const totalPairs = 8; // Totale di coppie da indovinare.

  // Funzione per generare e mescolare le carte.
  const generateCards = () => {
    const values = [...Array(8).keys()].map(v => v + 1); // [1, 2, ..., 8].
    const pairValues = [...values, ...values]; // Doppie.
    const shuffled = pairValues
      .map((val) => ({ val, id: Math.random() }))
      .sort(() => Math.random() - 0.5); // Shuffle.

    // Crea le carte con valori e stato flipped.
    return shuffled.map((card, index) => ({
      id: index,
      value: card.val,
      flipped: false,
    }));
  };

  //Determina se una carta deve essere mostrata (scoperta o già indovinata).
  const isCardVisible = (card, index) => {
    return card.flipped || matchedCards.includes(index);
  };

  // Rendering della griglia delle carte.
  const renderBoard = () => (
    <div className="memory-board" style={{
      display: "grid",
      gridTemplateColumns: "repeat(4, 60px)",
      gap: "10px",
      justifyContent: "center",
      marginTop: "20px"
    }}>
      {cards.map((card, index) => {
        const visible = isCardVisible(card, index);
        return (
          <div
            key={index}
            className={`card ${visible ? "flipped" : ""}`}
            onClick={() => handleCardClick(index)}
            style={{
              width: "60px",
              height: "60px",
              border: "1px solid #333",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "20px",
              backgroundColor: matchedCards.includes(index) ? "#c8f7c5" : "#eee",
              cursor: isMyTurn && !visible ? "pointer" : "default",
              color: visible ? "red" : "inherit"
            }}>
            {visible ? card.value : "❓"}
          </div>
        );
      })}
    </div>
  );

  // 2. Gestione del click su una carta.
  const handleCardClick = (index) => {
    if (gameEnded) return;
    if (!isMyTurn || cards[index]?.flipped || selectedCards.includes(index)) return;

    // Flippa la carta.
    const updatedCards = [...cards];
    updatedCards[index].flipped = true;
    setCards(updatedCards);

    const newSelection = [...selectedCards, index];
    setSelectedCards(newSelection);

    if (socket) {
      socket.emit("memory_flip", { to: peerId, index });
    }

    // Se sono due carte selezionate, verifica il match.
    if (newSelection.length === 2) {
      const [firstIdx, secondIdx] = newSelection;
      const firstCard = updatedCards[firstIdx];
      const secondCard = updatedCards[secondIdx];

      if (firstCard.value === secondCard.value) {
        // Match trovato.
        setMatchedCards((prev) => [...prev, firstIdx, secondIdx]);
        socket?.emit("memory_match", { to: peerId, matched: [firstIdx, secondIdx] });

        const newScore = myScore + 1;
        setMyScore(newScore);
        socket?.emit("memory_score", { to: peerId, score: newScore });

        checkGameEnd(newScore, opponentScore, matchedCards.length + 2);
        setSelectedCards([]);
      } else {
        //Nessun match → aspetta un secondo, poi gira di nuovo.
        setTimeout(() => {
          const reverted = [...updatedCards];
          if (reverted[firstIdx]) reverted[firstIdx].flipped = false;
          if (reverted[secondIdx]) reverted[secondIdx].flipped = false;
          setCards(reverted);
          setSelectedCards([]);
          socket?.emit("memory_unflip", { to: peerId, indexes: [firstIdx, secondIdx] });
          socket?.emit("memory_turn", { to: peerId });
          setIsMyTurn(false);
        }, 1000);
      }
    }
  };

  // Controlla se il gioco è finito.
  const checkGameEnd = (my, opponent, totalMatched) => {
    if (totalMatched === totalPairs * 2 && !gameEnded) {
      setGameEnded(true);

      // Determina il risultato.
      let result;
      if (my > opponent) result = "win";
      else if (my < opponent) result = "lose";
      else result = "draw";

      // Solo il primo giocatore invia il risultato.
      if (isFirstPlayer && result !== "draw" && !resultHandled) {
        setResultHandled(true);
        onGameResult?.(result);

        const opponentResult = result === "win" ? "lose" : "win";
        socket?.emit("memory_game_result", { to: peerId, result: opponentResult });
      }
    }
  };

  //Gestione eventi socket.
  useEffect(() => {
    if (!socket) return;

    socket.on("memory_init", (layout) => {
      setCards(layout);
      if (!isFirstPlayer) setIsMyTurn(false);
    });

    socket.on("memory_flip", (index) => {
      if (!cards[index]) return;
      const updated = [...cards];
      updated[index].flipped = true;
      setCards(updated);
    });

    socket.on("memory_match", ({ matched }) => {
      setMatchedCards((prev) => [...prev, ...matched]);
    });

    socket.on("memory_unflip", ({ indexes }) => {
      if (!cards.length) return;
      const updated = [...cards];
      indexes.forEach(i => {
        if (updated[i]) updated[i].flipped = false;
      });
      setCards(updated);
    });

    socket.on("memory_turn", () => {
      setIsMyTurn(true);
    });

    socket.on("memory_score", ({ score }) => {
      setOpponentScore(score);
      if (matchedCards.length === totalPairs * 2) {
        checkGameEnd(myScore, score, matchedCards.length);
      }
    });

    socket.on("memory_game_result", ({ result }) => {
      setGameEnded(true);
      if (!isFirstPlayer && !resultHandled && result !== "draw") {
        setResultHandled(true);
        onGameResult?.(result);
      }
    });

    // Pulizia al termine del componente.
    return () => {
      socket.off("memory_init");
      socket.off("memory_flip");
      socket.off("memory_match");
      socket.off("memory_unflip");
      socket.off("memory_turn");
      socket.off("memory_score");
      socket.off("memory_game_result");
    };
  }, [socket, cards, matchedCards, myScore, isFirstPlayer, peerId, onGameResult, resultHandled]);

  // Il primo giocatore genera le carte e avvia il gioco
  useEffect(() => {
    if (isFirstPlayer && socket) {
      const layout = generateCards(); //1.
      setCards(layout);
      socket.emit("memory_init", { to: peerId, layout });
      setIsMyTurn(true);
    }
  }, [isFirstPlayer, socket, peerId]);

  // Render finale del componente.
  return (
    <div>
      <h2>🧠 Memory - Minigioco A</h2>
      {cards.length === 0 ? (
        <p>In attesa del layout delle carte...</p>
      ) : (
        <>
          <div style={{ marginBottom: "10px" }}>
            <strong>Punteggio tuo:</strong> {myScore} | <strong>Avversario:</strong> {opponentScore}
          </div>

          {!gameEnded && (
            <p>{isMyTurn ? "È il tuo turno!" : "Turno dell'altro giocatore..."}</p>
          )}

          {renderBoard()}

          <button onClick={leaveGame} style={{ marginTop: "20px" }}>
            Esci dal minigioco
          </button>

          {gameEnded && (
            <div className="fireworks-container">
              <div className="fireworks">🎆🎇✨</div>
              <h3 style={{ marginTop: "10px" }}>Minigioco completato!</h3>
              <p>
                {myScore > opponentScore
                  ? "Hai vinto!"
                  : myScore < opponentScore
                  ? "Hai perso!"
                  : "Pareggio!"}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default MinigiocoA;
