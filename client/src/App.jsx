import { useSocket } from './hooks/useSocket.js';
import { useGameRoom } from './hooks/useGameRoom.js';
import { useCountdown } from './hooks/useCountdown.js';
import { JoinScreen } from './components/JoinScreen.jsx';
import { PlayerList } from './components/PlayerList.jsx';
import { LobbyView } from './components/LobbyView.jsx';
import { PromptSelectionView } from './components/PromptSelectionView.jsx';
import { ActorRecordingView } from './components/ActorRecordingView.jsx';
import { RelayRecordingView } from './components/RelayRecordingView.jsx';
import { GuesserWaitingView } from './components/GuesserWaitingView.jsx';
import { GuessingView } from './components/GuessingView.jsx';
import { ActorListeningView } from './components/ActorListeningView.jsx';
import { RoundRevealView } from './components/RoundRevealView.jsx';
import { GameOverView } from './components/GameOverView.jsx';
import { GUESSING_DURATION_MS } from './gameConstants.js';
import { friendlyError } from './errorMessages.js';

export default function App() {
  const { socket, connected, playerId } = useSocket();
  const game = useGameRoom(socket, playerId);
  const { snapshot } = game;

  const guessingRemainingMs = useCountdown(game.phaseEnteredAt, GUESSING_DURATION_MS);

  if (!snapshot) {
    return (
      <div className="app-shell">
        <JoinScreen onCreate={game.createRoom} onJoin={game.joinRoom} error={friendlyError(game.error)} />
      </div>
    );
  }

  const actor = snapshot.players.find((p) => p.id === snapshot.actorId);
  const guessingSecondsLeft = snapshot.state === 'GUESSING_ACTIVE' ? Math.ceil(guessingRemainingMs / 1000) : null;

  function renderPhase() {
    switch (snapshot.state) {
      case 'LOBBY':
        return <LobbyView snapshot={snapshot} onStartGame={game.startGame} />;

      case 'PROMPT_SELECTION':
        return game.isActor ? (
          <PromptSelectionView
            mode={snapshot.currentMode}
            options={snapshot.promptOptions}
            phaseEnteredAt={game.phaseEnteredAt}
            onSelectPrompt={game.selectPrompt}
          />
        ) : (
          <GuesserWaitingView actorName={actor?.name ?? 'The actor'} action="is picking a prompt" />
        );

      case 'ACTOR_RECORDING':
        return game.isActor ? (
          <ActorRecordingView
            prompt={snapshot.currentPrompt}
            onSubmitRecording={game.submitRecording}
            forcedModifier={snapshot.currentMode === 'TELEPHONE' ? 'DISTORT' : null}
          />
        ) : (
          <GuesserWaitingView actorName={actor?.name ?? 'The actor'} />
        );

      case 'RELAY_RECORDING':
        return game.isActor ? (
          <RelayRecordingView incomingAudio={game.incomingAudio} onSubmitRecording={game.submitRecording} />
        ) : (
          <GuesserWaitingView
            actorName={actor?.name ?? 'The next player'}
            action="is relaying the sound"
            subtext="Get ready — you might be up next."
          />
        );

      case 'GUESSING_ACTIVE': {
        // In TELEPHONE mode nobody who relayed can guess, not just whoever
        // happens to hold the mic right now (the last hop) — chainOrder
        // covers the whole chain; it's empty for every other mode, where
        // this falls back to the normal single-actor check.
        const cannotGuess = snapshot.chainOrder.length > 0 ? game.isChainMember : game.isActor;
        return cannotGuess ? (
          <ActorListeningView
            secondsLeft={guessingSecondsLeft}
            chat={game.chat}
            players={snapshot.players}
            selfId={playerId}
          />
        ) : (
          <GuessingView
            incomingAudio={game.incomingAudio}
            secondsLeft={guessingSecondsLeft}
            alreadyCorrect={snapshot.correctGuesserIds.includes(playerId)}
            chat={game.chat}
            players={snapshot.players}
            selfId={playerId}
            onSubmitGuess={game.submitGuess}
          />
        );
      }

      case 'ROUND_REVEAL':
        return (
          <RoundRevealView snapshot={snapshot} phaseEnteredAt={game.phaseEnteredAt} originalAudio={game.originalAudio} />
        );

      case 'GAME_OVER':
        return <GameOverView players={snapshot.players} onPlayAgain={game.playAgain} />;

      default:
        return null;
    }
  }

  return (
    <div className="app-shell">
      {!connected && <div className="banner banner-warning">Reconnecting…</div>}

      <header className="room-header">
        <span className="room-code">{snapshot.code}</span>
        {snapshot.totalRounds > 0 && (
          <span className="round-label">Round {snapshot.roundNumber} of {snapshot.totalRounds}</span>
        )}
        <button className="btn btn-ghost btn-sm leave-button" onClick={game.leaveRoom}>
          Leave
        </button>
      </header>

      {game.error && <div className="banner banner-error">{friendlyError(game.error)}</div>}

      <div className="room-layout">
        <main className="room-main card">{renderPhase()}</main>
        <aside className="room-sidebar card">
          <h3 className="sidebar-title">Players</h3>
          <PlayerList
            players={snapshot.players}
            actorId={snapshot.actorId}
            correctGuesserIds={snapshot.correctGuesserIds}
            selfId={playerId}
          />
        </aside>
      </div>
    </div>
  );
}
