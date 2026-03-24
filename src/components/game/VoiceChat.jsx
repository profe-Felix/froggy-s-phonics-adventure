import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Mic, MicOff } from 'lucide-react';

export default function VoiceChat({ gameId, playerNumber, opponentNumber }) {
  const [muted, setMuted] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const localStreamRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const voiceRecordRef = useRef(null);
  const isPlayer1 = playerNumber < opponentNumber;

  useEffect(() => {
    const initializeVoice = async () => {
      try {
        // Request microphone access
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = stream;

        // Create peer connection
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }]
        });
        peerConnectionRef.current = pc;

        // Add local audio tracks
        stream.getTracks().forEach(track => pc.addTrack(track, stream));

        // Handle remote stream
        pc.ontrack = (event) => {
          const remoteAudio = new Audio();
          remoteAudio.srcObject = event.streams[0];
          remoteAudio.play();
        };

        // Monitor connection state
        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'connected') {
            setConnected(true);
          }
        };

        // Handle ICE candidates
        const localCandidates = [];
        pc.onicecandidate = async (event) => {
          if (event.candidate) {
            localCandidates.push(JSON.stringify(event.candidate));
            // Update voice record with new candidates
            if (voiceRecordRef.current) {
              await base44.entities.PeerGameVoice.update(voiceRecordRef.current.id, {
                ice_candidates: localCandidates
              });
            }
          }
        };

        // Create or fetch voice record
        const existing = await base44.entities.PeerGameVoice.filter({
          game_id: gameId,
          player_number: playerNumber
        });

        let voiceRecord;
        if (existing.length === 0) {
          // Player 1 creates offer, Player 2 creates answer
          if (isPlayer1) {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            voiceRecord = await base44.entities.PeerGameVoice.create({
              game_id: gameId,
              player_number: playerNumber,
              webrtc_offer: JSON.stringify(offer),
              ice_candidates: []
            });
          } else {
            // Player 2 waits for player 1's offer
            voiceRecord = await base44.entities.PeerGameVoice.create({
              game_id: gameId,
              player_number: playerNumber,
              ice_candidates: []
            });
          }
        } else {
          voiceRecord = existing[0];
        }

        voiceRecordRef.current = voiceRecord;

        // Subscribe to opponent's updates
        const unsub = base44.entities.PeerGameVoice.subscribe((event) => {
          if (event.data.game_id === gameId && event.data.player_number === opponentNumber) {
            handleOpponentUpdate(event.data, pc, localCandidates, isPlayer1);
          }
        });

        return () => unsub();
      } catch (err) {
        setError('Microphone access denied');
        console.error(err);
      }
    };

    initializeVoice();

    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
    };
  }, [gameId, playerNumber, opponentNumber, isPlayer1]);

  const handleOpponentUpdate = async (opponentData, pc, localCandidates, isCaller) => {
    try {
      // Player 1: receive answer
      if (isCaller && !pc.currentRemoteDescription && opponentData.webrtc_answer) {
        const answer = JSON.parse(opponentData.webrtc_answer);
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      }

      // Player 2: receive offer and send answer
      if (!isCaller && !pc.currentRemoteDescription && opponentData.webrtc_offer) {
        const offer = JSON.parse(opponentData.webrtc_offer);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        // Send answer back
        await base44.entities.PeerGameVoice.update(voiceRecordRef.current.id, {
          webrtc_answer: JSON.stringify(answer)
        });
      }

      // Add opponent's ICE candidates
      if (opponentData.ice_candidates) {
        for (const candidateStr of opponentData.ice_candidates) {
          try {
            const candidate = JSON.parse(candidateStr);
            if (pc.currentRemoteDescription) {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
            }
          } catch (e) {
            // Ignore duplicate candidates
          }
        }
      }
    } catch (err) {
      console.error('Error handling opponent update:', err);
    }
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = muted;
      });
      setMuted(!muted);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 flex gap-2 items-center">
      {error && (
        <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2 bg-white rounded-full shadow-lg px-4 py-3">
        <div
          className={`w-3 h-3 rounded-full ${
            connected ? 'bg-green-500' : 'bg-gray-300'
          }`}
        />
        <span className="text-xs font-medium text-gray-700">
          {connected ? 'Connected' : 'Connecting...'}
        </span>

        <Button
          onClick={toggleMute}
          variant="ghost"
          size="icon"
          className={`rounded-full ${muted ? 'bg-red-100' : 'bg-green-100'}`}
        >
          {muted ? (
            <MicOff className="w-4 h-4 text-red-600" />
          ) : (
            <Mic className="w-4 h-4 text-green-600" />
          )}
        </Button>
      </div>
    </div>
  );
}