import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:openrelay.metered.ca:80" },
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
};

export interface RemoteStream {
  peerId: string;
  peerName: string;
  stream: MediaStream;
  type: "camera" | "screen";
}

interface PeerConnection {
  pc: RTCPeerConnection;
  userId: string;
  userName: string;
  audioSender: RTCRtpSender;
  videoSender: RTCRtpSender;
}

export function useWebRTC(
  roomId: string | null,
  currentUserId: string | undefined,
  currentUserName: string | undefined,
  micEnabled: boolean,
  camEnabled: boolean,
  usersInRoom: Array<{ user_id: string; user_name: string }>,
  localAudioStream: MediaStream | null = null,
  localCameraStream: MediaStream | null = null,
) {
  const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([]);
  const [screenSharing, setScreenSharing] = useState(false);
  const peersRef = useRef<Map<string, PeerConnection>>(new Map());
  const remoteCameraStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenPeersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const roomIdRef = useRef(roomId);
  const channelRef = useRef<any>(null);
  const lastLocalTrackIdsRef = useRef<{ audio: string | null; video: string | null }>({
    audio: null,
    video: null,
  });

  roomIdRef.current = roomId;

  // Clean up a single peer
  const cleanupPeer = useCallback((userId: string) => {
    const peer = peersRef.current.get(userId);
    if (peer) {
      peer.pc.close();
      peersRef.current.delete(userId);
    }
    remoteCameraStreamsRef.current.delete(userId);
    const screenPeer = screenPeersRef.current.get(userId);
    if (screenPeer) {
      screenPeer.close();
      screenPeersRef.current.delete(userId);
    }
    setRemoteStreams(prev => prev.filter(s => s.peerId !== userId));
  }, []);

  // Clean up all peers
  const cleanupAll = useCallback(() => {
    peersRef.current.forEach((peer) => peer.pc.close());
    peersRef.current.clear();
    remoteCameraStreamsRef.current.clear();
    screenPeersRef.current.forEach(pc => pc.close());
    screenPeersRef.current.clear();
    setRemoteStreams([]);
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
      setScreenSharing(false);
    }
  }, []);

  // Send signal via Supabase
  const sendSignal = useCallback(async (
    toUserId: string,
    signalType: string,
    signalData: any
  ) => {
    if (!currentUserId || !roomIdRef.current) return;
    await supabase.from("webrtc_signals").insert({
      room_id: roomIdRef.current,
      from_user_id: currentUserId,
      to_user_id: toUserId,
      signal_type: signalType,
      signal_data: signalData,
    });
  }, [currentUserId]);

  // Create peer connection to a remote user
  const createPeerConnection = useCallback(async (
    remoteUserId: string,
    remoteUserName: string,
    isInitiator: boolean
  ): Promise<RTCPeerConnection> => {
    // Clean existing peer first
    const existing = peersRef.current.get(remoteUserId);
    if (existing) {
      existing.pc.close();
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    const audioSender = pc.addTransceiver("audio", { direction: "sendrecv" }).sender;
    const videoSender = pc.addTransceiver("video", { direction: "sendrecv" }).sender;

    peersRef.current.set(remoteUserId, {
      pc,
      userId: remoteUserId,
      userName: remoteUserName,
      audioSender,
      videoSender,
    });

    const audioTrack = localAudioStream?.getAudioTracks()[0];
    if (audioTrack) {
      await audioSender.replaceTrack(audioTrack);
    }

    const videoTrack = localCameraStream?.getVideoTracks()[0];
    if (videoTrack) {
      await videoSender.replaceTrack(videoTrack);
    }

    // Handle remote stream
    pc.ontrack = (event) => {
      const stream = remoteCameraStreamsRef.current.get(remoteUserId) ?? new MediaStream();
      remoteCameraStreamsRef.current.set(remoteUserId, stream);

      const incomingTracks = event.streams[0]?.getTracks().length
        ? event.streams[0].getTracks()
        : [event.track];

      incomingTracks.forEach((track) => {
        const exists = stream.getTracks().some((existingTrack) => existingTrack.id === track.id);
        if (!exists) {
          stream.addTrack(track);
        }
      });

      event.track.onended = () => {
        stream.removeTrack(event.track);
        setRemoteStreams(prev => prev.filter(s => !(s.peerId === remoteUserId && s.type === "camera")));
        if (stream.getTracks().length > 0) {
          setRemoteStreams(prev => [...prev, { peerId: remoteUserId, peerName: remoteUserName, stream, type: "camera" }]);
        }
      };

      setRemoteStreams(prev => {
        const filtered = prev.filter(s => !(s.peerId === remoteUserId && s.type === "camera"));
        return [...filtered, { peerId: remoteUserId, peerName: remoteUserName, stream, type: "camera" }];
      });
    };

    // Send ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal(remoteUserId, "ice-candidate", {
          candidate: event.candidate.toJSON(),
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected" || pc.connectionState === "closed") {
        setRemoteStreams(prev => prev.filter(s => !(s.peerId === remoteUserId && s.type === "camera")));
      }
    };

    if (isInitiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await sendSignal(remoteUserId, "offer", {
        sdp: offer.sdp,
        type: offer.type,
        userName: currentUserName,
      });
    }

    return pc;
  }, [localAudioStream, localCameraStream, sendSignal, currentUserName]);

  useEffect(() => {
    const audioTrack = localAudioStream?.getAudioTracks()[0] ?? null;
    const videoTrack = localCameraStream?.getVideoTracks()[0] ?? null;

    peersRef.current.forEach((peer) => {
      peer.audioSender.replaceTrack(audioTrack).catch(() => {});
      peer.videoSender.replaceTrack(videoTrack).catch(() => {});
    });

    const nextTrackIds = {
      audio: audioTrack?.id ?? null,
      video: videoTrack?.id ?? null,
    };

    const trackChanged =
      lastLocalTrackIdsRef.current.audio !== nextTrackIds.audio ||
      lastLocalTrackIdsRef.current.video !== nextTrackIds.video;

    lastLocalTrackIdsRef.current = nextTrackIds;

    if (!trackChanged || peersRef.current.size === 0) return;

    peersRef.current.forEach(({ userId, userName }) => {
      createPeerConnection(userId, userName, true).catch(() => {});
    });
  }, [localAudioStream, localCameraStream, createPeerConnection]);

  // Handle incoming signals
  const handleSignal = useCallback(async (signal: any) => {
    if (!currentUserId) return;
    if (signal.to_user_id !== currentUserId) return;

    const fromUserId = signal.from_user_id;
    const signalType = signal.signal_type;
    const data = signal.signal_data as any;

    if (signalType === "offer") {
      const pc = await createPeerConnection(fromUserId, data.userName || "Colega", false);
      await pc.setRemoteDescription(new RTCSessionDescription({ sdp: data.sdp, type: data.type }));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await sendSignal(fromUserId, "answer", {
        sdp: answer.sdp,
        type: answer.type,
        userName: currentUserName,
      });
    } else if (signalType === "answer") {
      const peer = peersRef.current.get(fromUserId);
      if (peer && peer.pc.signalingState === "have-local-offer") {
        await peer.pc.setRemoteDescription(new RTCSessionDescription({ sdp: data.sdp, type: data.type }));
      }
    } else if (signalType === "ice-candidate") {
      const peer = peersRef.current.get(fromUserId);
      if (peer && data.candidate) {
        try {
          await peer.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch { /* ignore */ }
      }
    } else if (signalType === "screen-offer") {
      const pc = new RTCPeerConnection(ICE_SERVERS);
      screenPeersRef.current.set(fromUserId, pc);
      pc.ontrack = (event) => {
        const [stream] = event.streams;
        if (stream) {
          setRemoteStreams(prev => {
            const filtered = prev.filter(s => !(s.peerId === fromUserId && s.type === "screen"));
            return [...filtered, { peerId: fromUserId, peerName: data.userName || "Colega", stream, type: "screen" }];
          });
        }
      };
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendSignal(fromUserId, "screen-ice-candidate", { candidate: event.candidate.toJSON() });
        }
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected" || pc.connectionState === "closed") {
          setRemoteStreams(prev => prev.filter(s => !(s.peerId === fromUserId && s.type === "screen")));
        }
      };
      await pc.setRemoteDescription(new RTCSessionDescription({ sdp: data.sdp, type: data.type }));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await sendSignal(fromUserId, "screen-answer", { sdp: answer.sdp, type: answer.type });
    } else if (signalType === "screen-answer") {
      const pc = screenPeersRef.current.get(fromUserId);
      if (pc && pc.signalingState === "have-local-offer") {
        await pc.setRemoteDescription(new RTCSessionDescription({ sdp: data.sdp, type: data.type }));
      }
    } else if (signalType === "screen-ice-candidate") {
      const pc = screenPeersRef.current.get(fromUserId);
      if (pc && data.candidate) {
        try { await pc.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch { /* ignore */ }
      }
    } else if (signalType === "screen-stop") {
      setRemoteStreams(prev => prev.filter(s => !(s.peerId === fromUserId && s.type === "screen")));
      const pc = screenPeersRef.current.get(fromUserId);
      if (pc) { pc.close(); screenPeersRef.current.delete(fromUserId); }
    }

    // Clean up processed signal
    await supabase.from("webrtc_signals").delete().eq("id", signal.id);
  }, [currentUserId, currentUserName, createPeerConnection, sendSignal]);

  // Subscribe to signals via Realtime
  useEffect(() => {
    if (!roomId || !currentUserId) return;

    const processPendingSignals = async () => {
      const { data } = await supabase
        .from("webrtc_signals")
        .select("*")
        .eq("to_user_id", currentUserId)
        .eq("room_id", roomId)
        .order("created_at", { ascending: true });

      if (data?.length) {
        for (const signal of data) {
          await handleSignal(signal);
        }
      }
    };

    processPendingSignals();

    const channel = supabase
      .channel(`webrtc-signals-${roomId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "webrtc_signals",
        filter: `to_user_id=eq.${currentUserId}`,
      }, (payload) => {
        handleSignal(payload.new);
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [roomId, currentUserId, handleSignal]);

  // Connect to all peers in room when entering / users change
  useEffect(() => {
    if (!roomId || !currentUserId) return;

    const otherUsers = usersInRoom.filter(u => u.user_id !== currentUserId);
    
    // Connect to new users (only initiate if our ID is "greater" to avoid double offers)
    otherUsers.forEach(u => {
      if (!peersRef.current.has(u.user_id) && currentUserId > u.user_id) {
        createPeerConnection(u.user_id, u.user_name, true);
      }
    });

    // Remove peers that left the room
    const otherIds = new Set(otherUsers.map(u => u.user_id));
    peersRef.current.forEach((_, id) => {
      if (!otherIds.has(id)) cleanupPeer(id);
    });
  }, [roomId, currentUserId, usersInRoom, createPeerConnection, cleanupPeer]);

  // Clean up when leaving room
  useEffect(() => {
    if (!roomId) {
      cleanupAll();
    }
  }, [roomId, cleanupAll]);

  // Unmount cleanup
  useEffect(() => {
    return () => { cleanupAll(); };
  }, [cleanupAll]);

  // Screen sharing
  const startScreenShare = useCallback(async () => {
    if (!currentUserId || !roomId) return;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      screenStreamRef.current = stream;
      setScreenSharing(true);

      const otherUsers = usersInRoom.filter(u => u.user_id !== currentUserId);

      for (const u of otherUsers) {
        const pc = new RTCPeerConnection(ICE_SERVERS);
        screenPeersRef.current.set(u.user_id, pc);
        
        stream.getTracks().forEach(track => pc.addTrack(track, stream));

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            sendSignal(u.user_id, "screen-ice-candidate", { candidate: event.candidate.toJSON() });
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sendSignal(u.user_id, "screen-offer", {
          sdp: offer.sdp,
          type: offer.type,
          userName: currentUserName,
        });
      }

      // When screen share stops
      stream.getVideoTracks()[0].onended = () => {
        stopScreenShare();
      };
    } catch {
      // User cancelled
    }
  }, [currentUserId, roomId, usersInRoom, sendSignal, currentUserName]);

  const stopScreenShare = useCallback(() => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
    }
    setScreenSharing(false);

    // Notify peers
    screenPeersRef.current.forEach((pc, userId) => {
      pc.close();
      sendSignal(userId, "screen-stop", {});
    });
    screenPeersRef.current.clear();
  }, [sendSignal]);

  return {
    remoteStreams,
    screenSharing,
    startScreenShare,
    stopScreenShare,
    localStream: localAudioStream,
  };
}
