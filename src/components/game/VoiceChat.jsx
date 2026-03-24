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

        // Handle ICE candidates
        const candidates = [];
        pc.onicecandidate = async (event) => {
          if (event.candidate) {
            candidates.push(JSON.stringify(event.candidate));
            // Update voice record with new candidates
            if (voiceRecordRef.current) {
              await base44.entities.PeerGameVoice.update(voiceRecordRef.current.id, {
                ice_candidates: candidates
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
          // Create offer (player initiating)
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          voiceRecord = await base44.entities.PeerGameVoice.create({
            game_id: gameId,
            player_number: playerNumber,
            webrtc_offer: JSON.stringify(offer),
            ice_candidates: []
          });
        } else {
          voiceRecord = existing[0];
        }

        voiceRecordRef.current = voiceRecord;

        // Subscribe to opponent's updates
        const unsub = base44.entities.PeerGameVoice.subscribe((event) => {
          const data = event.data;
          if (data.game_id === gameId && data.player_number === opponentNumber) {
            handleOpponentUpdate(data, pc, candidates);
          }
        });

        // Check if opponent already has answer
        if (voiceRecord.webrtc_answer) {
          const answer = JSON.parse(voiceRecord.webrtc_answer);
          pc.setRemoteDescription(new RTCSessionDescription(answer));
        }

        return () => unsub();
      } catch (err) {
        setError('Microphone access denied or WebRTC error');
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
  }, [gameId, playerNumber, opponentNumber]);

  const handleOpponentUpdate = async (opponentData, pc, myCandidates) => {
    try {
      if (!pc.currentRemoteDescription && opponentData.webrtc_offer) {
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
          const candidate = JSON.parse(candidateStr);
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            console.log('ICE candidate error:', e);
          }
        }
      }

      if (pc.connectionState === 'connected') {
        setConnected(true);
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