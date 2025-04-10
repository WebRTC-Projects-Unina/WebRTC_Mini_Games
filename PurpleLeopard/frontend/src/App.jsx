// Import dei moduli necessari da React.
import React, { useEffect, useRef, useState } from "react";

// Import del client socket.io per la comunicazione in tempo reale.
import io from "socket.io-client";

// Stili dell'applicazione.
import "./App.css";

// Import dei componenti dei minigiochi.
import MinigiocoA from "./games/MinigiocoA";
import MinigiocoB from "./games/MinigiocoB";
import MinigiocoC from "./games/MinigiocoC";

// Icone da react-icons
import { FaIdCard, FaPhone, FaGamepad, FaUserCheck, FaInfoCircle, FaUniversity } from "react-icons/fa";

// Determina l'URL del server socket in base all'ambiente.
const socketURL = window.location.hostname === 'localhost' 
  ? 'http://localhost:4000' //sei in locale.
  : window.location.origin; //non sei in locale.

// Connessione socket.io.
const socket = io(socketURL);

function App() {
  // Stati per la gestione delle chiamate e dei giochi.
  const [me, setMe] = useState(""); // ID utente.
  const [stream, setStream] = useState(null); // Stream locale.
  const [receivingCall, setReceivingCall] = useState(false); // Flag per chiamata in arrivo.
  const [caller, setCaller] = useState(""); // ID del chiamante.
  const [callerSignal, setCallerSignal] = useState(null); // Descrizione della sessione del chiamante.
  const [callAccepted, setCallAccepted] = useState(false); // Flag se la chiamata è accettata.
  const [idToCall, setIdToCall] = useState(""); // ID dell'utente da chiamare.
  const [callEnded, setCallEnded] = useState(false); // Flag se la chiamata è terminata.
  const [gameRequest, setGameRequest] = useState(null); // Richiesta di gioco ricevuta.
  const [activeGame, setActiveGame] = useState(null); // Minigioco attivo.
  const [isFirstPlayer, setIsFirstPlayer] = useState(false); // Se il giocatore è il primo.
  const [peerId, setPeerId] = useState(null); // ID dell'altro peer.
  const [myGlobalScore, setMyGlobalScore] = useState(0); // Punteggio personale.
  const [opponentGlobalScore, setOpponentGlobalScore] = useState(0); // Punteggio avversario.
  const [showInstructions, setShowInstructions] = useState(true); // Mostrare le istruzioni iniziali.

  // Riferimenti ai video, peer connection e audio -> li usiamo per mantenere gli oggetti persistenti senza causare il re-render.
  const myVideo = useRef();
  const userVideo = useRef();
  const peerConnection = useRef(null);
  const remoteStream = useRef(new MediaStream());
  const ringtoneAudio = useRef(null);
  const incomingCallAudio = useRef(null);

  // Hook per ottenere lo stream audio/video e configurare i socket.
  useEffect(() => {
    // 0. Accesso a webcam e microfono.
    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((currentStream) => {
      setStream(currentStream);
      if (myVideo.current) myVideo.current.srcObject = currentStream;
    }).catch(err => {
      console.error("Errore nell'accesso alla webcam/microfono:", err);
    });

    //0. Ricezione del proprio ID socket.
    socket.on("me", (id) => setMe(id));

    //1.1 Gestione della chiamata in arrivo.
    socket.on("callUser", (data) => {
      setReceivingCall(true);
      setCaller(data.from);
      setCallerSignal(data.signal);
      // Riproduzione audio per chiamata in arrivo.
      if (incomingCallAudio.current) {
        incomingCallAudio.current.currentTime = 0;
        incomingCallAudio.current.loop = true;
        incomingCallAudio.current.play().catch(err => console.log("Errore riproduzione suono chiamata:", err));
      }
    });

    // Ricezione ICE candidate (WebRTC).
    socket.on("ice-candidate", async ({ candidate }) => {
      try {
        if (peerConnection.current) {
          await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch (e) {
        console.error("Errore ICE candidate:", e);
      }
    });

    // Ricezione richiesta di gioco.
    socket.on("receiveGameRequest", ({ from, game }) => {
      setGameRequest({ from, game });
      setIsFirstPlayer(false);
      setPeerId(from);
    });

    // Conferma di avvio del gioco.
    socket.on("gameStartConfirmed", ({ game }) => setActiveGame(game));

    // Fine del gioco.
    socket.on("gameEnded", () => setActiveGame(null));

    // Cleanup dei listener quando il componente viene smontato.
    return () => {
      socket.off("me");
      socket.off("callUser");
      socket.off("ice-candidate");
      socket.off("receiveGameRequest");
      socket.off("gameStartConfirmed");
      socket.off("gameEnded");
    };
  }, []);

  //1.1 Funzione per chiamare un utente (async è più leggibile per le promesse).
  const callUser = async (id) => {
    // Creazione della connessione WebRTC.
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" } //server STUN pubblici gratuiti.
      ]
    });

    peerConnection.current = pc;

    // Aggiunge le tracce locali (audio/video) alla connessione.
    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    // Quando ricevi una traccia remota, la aggiungi allo stream remoto.
    pc.ontrack = (event) => {
      event.streams[0].getTracks().forEach(track => remoteStream.current.addTrack(track));
      if (userVideo.current) userVideo.current.srcObject = remoteStream.current;
    };

    // Gestione degli ICE candidate locali
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", { to: id, candidate: event.candidate });
      }
    };

    // Creazione e invio dell'offerta.
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    socket.emit("callUser", {
      userToCall: id,
      signalData: offer,
      from: me
    });

    // Ricezione della risposta (answer).
    socket.once("callAccepted", async (answer) => {
      setCallAccepted(true);
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      if (ringtoneAudio.current) ringtoneAudio.current.pause();
      if (incomingCallAudio.current) incomingCallAudio.current.pause();
      setShowInstructions(false);
    });

    setPeerId(id);
  };

  // 1.2 Funzione per rispondere a una chiamata.
  const answerCall = async () => {
    if (incomingCallAudio.current) incomingCallAudio.current.pause();
    setCallAccepted(true);

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
      ]
    });

    peerConnection.current = pc;
    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    pc.ontrack = (event) => {
      event.streams[0].getTracks().forEach(track => remoteStream.current.addTrack(track));
      if (userVideo.current) userVideo.current.srcObject = remoteStream.current;
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", { to: caller, candidate: event.candidate });
      }
    };

    // Imposta la descrizione remota e invia la risposta.
    await pc.setRemoteDescription(new RTCSessionDescription(callerSignal));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit("answerCall", {
      signal: answer,
      to: caller
    });

    setPeerId(caller);
    setShowInstructions(false);
  };

  // Funzione per terminare la chiamata.
  const leaveCall = () => {
    setCallEnded(true);
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
    remoteStream.current = new MediaStream();
    if (ringtoneAudio.current) ringtoneAudio.current.pause();
    if (incomingCallAudio.current) incomingCallAudio.current.pause();
    window.location.reload(); // Ricarica la pagina per resettare lo stato.
  };

  // Richiesta di inizio gioco.
  const requestGame = (game) => {
    setIsFirstPlayer(true);
    setPeerId(caller || idToCall);
    socket.emit("startGameRequest", { to: caller || idToCall, game });
  };

  // Accetta una richiesta di gioco.
  const acceptGame = () => {
    if (gameRequest) {
      socket.emit("acceptGameRequest", { to: gameRequest.from, game: gameRequest.game });
      setActiveGame(gameRequest.game);
      setGameRequest(null);
      setIsFirstPlayer(false);
    }
  };

  // Esci dal gioco.
  const leaveGame = () => {
    socket.emit("leaveGame", { to: peerId });
    setActiveGame(null);
  };

  // Gestisce il risultato del gioco (win/lose).
  const handleGameResult = (result) => {
    if (result === "win") {
      setMyGlobalScore((prev) => prev + 1);
    } else if (result === "lose") {
      setOpponentGlobalScore((prev) => prev + 1);
    }
  };

  // Mostra o nasconde le istruzioni.
  const toggleInstructions = () => {
    setShowInstructions(!showInstructions);
  };

  
  return (
    <div className="container">
      <div className="header">
        <div className="logo-title">
          <img src="/logo.png" alt="Purple Leopard Logo" className="logo" />
          <h1>Purple Leopard</h1>
          <img src="/logo.png" alt="Purple Leopard Logo" className="logo" />
        </div>
        <button 
          onClick={toggleInstructions} 
          className="info-button"
          aria-label="Mostra/Nascondi istruzioni"
        >
          <FaInfoCircle size={18} />
        </button>
      </div>

      {showInstructions && (
        <div className="intro-section">
          <h2><FaInfoCircle size={16} /> Come usare l'applicazione</h2>
          <div className="instructions">
            <div className="instruction-card">
              <h3><FaIdCard size={14} /> Ottieni il tuo ID</h3>
              <p>Il tuo ID univoco è: <span className="id-display">{me || "Caricamento..."}</span></p>
              <p>Condividi questo codice con chi vuoi chiamare.</p>
            </div>
            
            <div className="instruction-card">
              <h3><FaPhone size={14} /> Effettua una chiamata</h3>
              <p>Inserisci l'ID dell'altro utente e clicca "Chiama".</p>
              <p>Attendi che rispondano.</p>
            </div>
            
            <div className="instruction-card">
              <h3><FaUserCheck size={14} /> Rispondi a una chiamata</h3>
              <p>Se ricevi una chiamata, potrai accettare o rifiutare.</p>
              <p>La connessione inizierà automaticamente.</p>
            </div>
            
            <div className="instruction-card">
              <h3><FaGamepad size={14} /> Minigiochi</h3>
              <p>Sfida l'altro utente in divertenti minigiochi.</p>
              <p>Scegli un gioco e attendi la conferma.</p>
            </div>
          </div>
        </div>
      )}

      <div className="videos">
        <div>
          <h3 align="center">Il mio video</h3>
          <video playsInline muted ref={myVideo} autoPlay className="video" />
        </div>
        <div>
          <h3 align="center">Video dell'altro utente</h3>
          <video playsInline ref={userVideo} autoPlay className="video" />
        </div>
      </div>

      <div className="controls">
        <p align="center">Il tuo ID: <strong>{me}</strong></p>
        <p style={{
            textAlign: 'center',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'baseline',
            gap: '10px',
            fontSize: '22px',
            margin: '20px 0',
            color: '#f8d6ff',
            textShadow: '0 0 8px rgba(206, 147, 216, 0.7)'
          }}>
          <span>Punteggio: </span>
          <strong style={{
                  fontSize: '32px',
                  color: 'white',
                  background: 'rgba(115, 45, 145, 0.5)',
                  padding: '4px 16px',
                  borderRadius: '20px',
                  boxShadow: '0 0 10px rgba(142, 68, 173, 0.5)',
                  minWidth: '40px',
                  display: 'inline-block',
                  textAlign: 'center'
                }}>{myGlobalScore}</strong>
  
          <span style={{
            color: 'rgba(255,255,255,0.3)',
            fontSize: '24px',
            margin: '0 5px'
          }}>|</span>
          <span>Avversario: </span>
          <strong style={{
            fontSize: '32px',
            color: 'white',
            background: 'rgba(115, 45, 145, 0.5)',
            padding: '4px 16px',
            borderRadius: '20px',
            boxShadow: '0 0 10px rgba(142, 68, 173, 0.5)',
            minWidth: '40px',
            display: 'inline-block',
            textAlign: 'center'
          }}>{opponentGlobalScore}</strong>
        </p>
        <input //0. setta l'id da chiamare ogni volta che l'utente scrive qualcosa.
          type="text" 
          placeholder="ID dell'utente da chiamare" 
          value={idToCall} 
          onChange={(e) => setIdToCall(e.target.value)} 
        />

        <div className="buttons">
          {!callAccepted && !callEnded ? ( //1. se non ho avviato la chiamata posso chiamare l'utente passando alla funzione il suo ID ottenuto in input.
            <button onClick={() => callUser(idToCall)}>
              Chiama <FaPhone size={14} style={{ marginLeft: '8px' }} />
            </button>          ) : (
            <button onClick={leaveCall}>Termina chiamata</button> //FINE. altrimenti posso terminare la chiamata.
          )}
        </div>

        {receivingCall && !callAccepted && ( //1.2 una volta che la chiamata è stata inoltrata se viene accettata chiamiamo la funzione.
          <div className="incoming-call">
            <p>📞 <strong>{caller}</strong> ti sta chiamando...</p>
            <button onClick={answerCall}><FaUserCheck size={14} /> Rispondi</button>
          </div>
        )}

        {callAccepted && !callEnded && !activeGame && (
          <div className="minigames">
            <h3>Minigiochi disponibili</h3>
            <button onClick={() => requestGame("Minigioco A")}><FaGamepad size={14} /> Memory</button>
            <button onClick={() => requestGame("Minigioco B")}><FaGamepad size={14} /> La torre del volume</button>
            <button onClick={() => requestGame("Minigioco C")}><FaGamepad size={14} /> Duello far west</button>
          </div>
        )}

        {gameRequest && !activeGame && (
          <div className="game-request">
            <p><strong>{gameRequest.from}</strong> vuole giocare a <strong>{gameRequest.game}</strong></p>
            <button onClick={acceptGame}><FaGamepad size={14} /> Accetta</button>
          </div>
        )}
      </div>

      {activeGame && (
        <div className="game-container">
          {activeGame === "Minigioco A" && (
            <MinigiocoA socket={socket} leaveGame={leaveGame} isFirstPlayer={isFirstPlayer} peerId={peerId} onGameResult={handleGameResult} />
          )}
          {activeGame === "Minigioco B" && (
            <MinigiocoB socket={socket} leaveGame={leaveGame} isFirstPlayer={isFirstPlayer} peerId={peerId} onGameResult={handleGameResult} />
          )}
          {activeGame === "Minigioco C" && (
            <MinigiocoC 
              socket={socket} 
              leaveGame={leaveGame} 
              isFirstPlayer={isFirstPlayer} 
              peerId={peerId} 
              onGameResult={handleGameResult} 
            /> 
          )}
        </div>
      )}

      <footer className="footer">
        <p><FaUniversity /> WebApp realizzata da Erika Morelli e Luca Pisani</p>
        <p>Fatto con amore ❤️ per il corso di Web and Real Time Communication - Prof. Simon Pietro Romano</p>
        <p>Università degli Studi di Napoli Federico II</p>
      </footer>

      <audio ref={ringtoneAudio} src="/ringtone.mp3" preload="auto" />
      <audio ref={incomingCallAudio} src="/ringtone.mp3" preload="auto" />
    </div>
  );
}

export default App;
