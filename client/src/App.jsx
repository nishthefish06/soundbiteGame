import { useState } from 'react';
import { useSocket } from './hooks/useSocket.js';
import { useGameRoom } from './hooks/useGameRoom.js';
import { useCountdown } from './hooks/useCountdown.js';
import { JoinScreen } from './components/JoinScreen.jsx';
import { PlayerList } from './components/PlayerList.jsx';
import { LobbyView } from './components/LobbyView.jsx';
import { PromptSelectionView } from './components/PromptSelectionView.jsx';
import { ActorRecordingView } from './components/ActorRecordingView.jsx';
import { RelayRecordingView } from './components/RelayRecordingView.jsx';
import { GroupRecordingView } from './components/GroupRecordingView.jsx';
import { ComposingView } from './components/ComposingView.jsx';
import { MatchingView } from './components/MatchingView.jsx';
import { GuesserWaitingView } from './components/GuesserWaitingView.jsx';
import { GuessingView } from './components/GuessingView.jsx';
import { ActorListeningView } from './components/ActorListeningView.jsx';
import { RatingView } from './components/RatingView.jsx';
import { ActorAwaitingRatingView } from './components/ActorAwaitingRatingView.jsx';
import { RoundRevealView } from './components/RoundRevealView.jsx';
import { GameOverView } from './components/GameOverView.jsx';
import { HowToPlayModal } from './components/HowToPlayModal.jsx';
import { CopyIcon, CheckIcon } from './components/icons.jsx';
import {
  GUESSING_DURATION_MS,
  RATING_DURATION_MS,
  MATCHING_DURATION_MS,
  SONG_REVEAL_DURATION_MS,
  VALID_ROUND_COUNTS,
  GAME_MODES,
} from './gameConstants.js';
import { friendlyError } from './errorMessages.js';

export default function App() {
  const { socket, connected, playerId } = useSocket();
  const game = useGameRoom(socket, playerId);
  const { snapshot } = game;

  const guessingRemainingMs = useCountdown(game.phaseEnteredAt, GUESSING_DURATION_MS);
  const ratingRemainingMs = useCountdown(game.phaseEnteredAt, RATING_DURATION_MS);
  const matchingRemainingMs = useCountdown(game.phaseEnteredAt, MATCHING_DURATION_MS);
  const songRevealRemainingMs = useCountdown(game.phaseEnteredAt, SONG_REVEAL_DURATION_MS);

  // Lifted out of LobbyView so a "Play again" (which unmounts/remounts it)
  // doesn't reset the host back to the defaults every time.
  const [lobbyRoundCount, setLobbyRoundCount] = useState(VALID_ROUND_COUNTS[0]);
  const [lobbyMode, setLobbyMode] = useState(GAME_MODES[0]);
  const [lobbyCustomText, setLobbyCustomText] = useState('');

  const [copied, setCopied] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);

  if (!snapshot) {
    return (
      <div className="app-shell">
        <JoinScreen onCreate={game.createRoom} onJoin={game.joinRoom} error={friendlyError(game.error)} />
      </div>
    );
  }

  const actor = snapshot.players.find((p) => p.id === snapshot.actorId);
  const guessingSecondsLeft = snapshot.state === 'GUESSING_ACTIVE' ? Math.ceil(guessingRemainingMs / 1000) : null;
  const ratingSecondsLeft = snapshot.state === 'RATING_ACTIVE' ? Math.ceil(ratingRemainingMs / 1000) : null;
  const matchingSecondsLeft = snapshot.state === 'MATCHING_ACTIVE' ? Math.ceil(matchingRemainingMs / 1000) : null;
  const songRevealSecondsLeft = snapshot.state === 'SONG_REVEAL_ACTIVE' ? Math.ceil(songRevealRemainingMs / 1000) : null;

  function renderPhase() {
    switch (snapshot.state) {
      case 'LOBBY':
        return (
          <LobbyView
            snapshot={snapshot}
            isHost={game.isHost}
            onStartGame={game.startGame}
            roundCount={lobbyRoundCount}
            onRoundCountChange={setLobbyRoundCount}
            mode={lobbyMode}
            onModeChange={setLobbyMode}
            customText={lobbyCustomText}
            onCustomTextChange={setLobbyCustomText}
          />
        );

      case 'PROMPT_SELECTION':
        return game.isActor ? (
          <PromptSelectionView
            mode={snapshot.currentMode}
            options={snapshot.promptOptions}
            phaseEnteredAt={game.phaseEnteredAt}
            onSelectPrompt={game.selectPrompt}
          />
        ) : (
          <GuesserWaitingView
            actorName={actor?.name ?? 'The actor'}
            action="is picking a prompt"
            chainOrder={snapshot.chainOrder}
            players={snapshot.players}
            actorId={snapshot.actorId}
            selfId={playerId}
          />
        );

      case 'ACTOR_RECORDING':
        return game.isActor ? (
          <ActorRecordingView
            prompt={snapshot.currentPrompt}
            onSubmitRecording={game.submitRecording}
            forcedModifier={snapshot.currentMode === 'TELEPHONE' ? 'DISTORT' : null}
            phaseEnteredAt={game.phaseEnteredAt}
          />
        ) : (
          <GuesserWaitingView
            actorName={actor?.name ?? 'The actor'}
            chainOrder={snapshot.chainOrder}
            players={snapshot.players}
            actorId={snapshot.actorId}
            selfId={playerId}
          />
        );

      case 'RELAY_RECORDING':
        return game.isActor ? (
          <RelayRecordingView
            incomingAudio={game.incomingAudio}
            onSubmitRecording={game.submitRecording}
            phaseEnteredAt={game.phaseEnteredAt}
          />
        ) : (
          <GuesserWaitingView
            actorName={actor?.name ?? 'The next player'}
            action="is relaying the sound"
            subtext="Get ready — you might be up next."
            chainOrder={snapshot.chainOrder}
            players={snapshot.players}
            actorId={snapshot.actorId}
            selfId={playerId}
          />
        );

      case 'GROUP_RECORDING':
        return game.isSpectating ? (
          <GuesserWaitingView
            actorName="Everyone"
            action="is recording a disguised clip"
            subtext="You'll join the rotation next round."
          />
        ) : (
          <GroupRecordingView
            prompt={snapshot.currentPrompt}
            onSubmitRecording={game.submitRecording}
            phaseEnteredAt={game.phaseEnteredAt}
            recordingProgress={game.recordingProgress}
          />
        );

      case 'COMPOSING':
        return game.isSpectating ? (
          <GuesserWaitingView
            actorName="Everyone"
            action="is composing a track"
            subtext="You'll join the rotation next round."
          />
        ) : (
          <ComposingView
            onSubmitComposition={game.submitComposition}
            phaseEnteredAt={game.phaseEnteredAt}
            composingProgress={game.composingProgress}
          />
        );

      case 'MATCHING_ACTIVE':
        return (
          <MatchingView
            incomingAudio={game.incomingAudio}
            secondsLeft={matchingSecondsLeft}
            isClipOwner={game.isClipOwner}
            isSpectating={game.isSpectating}
            alreadyGuessed={snapshot.clipGuesserIds.includes(playerId)}
            players={snapshot.players}
            selfId={playerId}
            recordedPlayerIds={snapshot.recordedPlayerIds}
            clipNumber={snapshot.clipIndex + 1}
            totalClips={snapshot.totalClips}
            onSubmitMatchGuess={game.submitMatchGuess}
          />
        );

      case 'GUESSING_ACTIVE': {
        // In TELEPHONE mode nobody who relayed can guess, not just whoever
        // happens to hold the mic right now (the last hop) — chainOrder
        // covers the whole chain; it's empty for every other mode, where
        // this falls back to the normal single-actor check. A spectator
        // (joined mid-game) can't guess either, regardless of mode.
        const cannotGuess = (snapshot.chainOrder.length > 0 ? game.isChainMember : game.isActor) || game.isSpectating;
        return cannotGuess ? (
          <ActorListeningView
            secondsLeft={guessingSecondsLeft}
            chat={game.chat}
            players={snapshot.players}
            selfId={playerId}
            isSpectating={game.isSpectating}
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

      // SONG_RECREATION mode: one player's composition plays and everyone
      // else free-guesses its title/artist. Reuses GuessingView/
      // ActorListeningView as-is, same infra GUESSING_ACTIVE uses above —
      // Room.js's submitGuess already branches on currentMode server-side,
      // so the client needs no new guessing UI, just a different gate
      // (isCurrentComposer instead of isActor/chain membership).
      case 'SONG_REVEAL_ACTIVE': {
        const cannotGuess = game.isCurrentComposer || game.isSpectating;
        return cannotGuess ? (
          <ActorListeningView
            secondsLeft={songRevealSecondsLeft}
            chat={game.chat}
            players={snapshot.players}
            selfId={playerId}
            isSpectating={game.isSpectating}
            subtext={
              game.isSpectating
                ? undefined
                : "You can't guess your own song — just watch the chat roll in."
            }
          />
        ) : (
          <GuessingView
            incomingAudio={game.incomingAudio}
            secondsLeft={songRevealSecondsLeft}
            alreadyCorrect={snapshot.correctGuesserIds.includes(playerId)}
            chat={game.chat}
            players={snapshot.players}
            selfId={playerId}
            onSubmitGuess={game.submitGuess}
            heading="Guess the song"
            placeholder="Title, artist, or both…"
          />
        );
      }

      case 'RATING_ACTIVE':
        return game.isActor || game.isSpectating ? (
          <ActorAwaitingRatingView
            secondsLeft={ratingSecondsLeft}
            ratingProgress={game.ratingProgress}
            isSpectating={game.isSpectating}
          />
        ) : (
          <RatingView
            incomingAudio={game.incomingAudio}
            secondsLeft={ratingSecondsLeft}
            ratingProgress={game.ratingProgress}
            onSubmitRating={game.submitRating}
          />
        );

      case 'ROUND_REVEAL':
        return (
          <RoundRevealView snapshot={snapshot} phaseEnteredAt={game.phaseEnteredAt} originalAudio={game.originalAudio} />
        );

      case 'GAME_OVER':
        return (
          <GameOverView players={snapshot.players} roundHistory={game.roundHistory} onPlayAgain={game.playAgain} />
        );

      default:
        return null;
    }
  }

  return (
    <div className="app-shell">
      {!connected && <div className="banner banner-warning">Reconnecting…</div>}

      <header className="room-header">
        <span className="room-code">{snapshot.code}</span>
        <button
          className="btn btn-ghost btn-sm copy-code-button"
          onClick={async () => {
            const url = `${window.location.origin}${window.location.pathname}?room=${snapshot.code}`;
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              // Clipboard API unavailable/denied — the code is still visible to copy by hand.
            }
          }}
          title="Copy invite link"
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
          {copied ? 'Copied!' : 'Copy invite'}
        </button>
        {snapshot.totalRounds > 0 && (
          <span className="round-label">Round {snapshot.roundNumber} of {snapshot.totalRounds}</span>
        )}
        <button
          className="btn btn-ghost btn-sm how-to-play-button"
          onClick={() => setShowHowToPlay(true)}
          title="How to play"
        >
          ?
        </button>
        <button className="btn btn-ghost btn-sm leave-button" onClick={game.leaveRoom}>
          Leave
        </button>
      </header>

      {showHowToPlay && <HowToPlayModal onClose={() => setShowHowToPlay(false)} />}

      {game.isSpectating && (
        <div className="banner banner-warning">
          You joined mid-game — you'll join the rotation next round.
        </div>
      )}

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
            hostId={snapshot.hostId}
            isHost={game.isHost}
            onKick={game.kickPlayer}
            onTransferHost={game.transferHost}
          />
        </aside>
      </div>
    </div>
  );
}
