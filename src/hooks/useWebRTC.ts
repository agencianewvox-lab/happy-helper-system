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
  makingOffer: boolean;
  ignoreOffer: boolean;
  isSettingRemoteAnswerPending: boolean;
  pendingIceCandidates: RTCIceCandidateInit[];
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
  const lastLocalTrackIdsRef = useRef<{ audio: string | null; video: string | null }>({
    audio: null,
    video: null,
  });

  roomIdRef.current = roomId;

  const isPolitePeer = useCallback(
    (remoteUserId: string) => {
      if (!currentUserId) return false;
      return currentUserId < remoteUserId;
    },
    [currentUserId],
  );

  const sendSignal = useCallback(
    async (toUserId: string, signalType: string, signalData: unknown) => {
      if (!currentUserId || !roomIdRef.current) return;

      await supabase.from("webrtc_signals").insert({
        room_id: roomIdRef.current,
        from_user_id: currentUserId,
        to_user_id: toUserId,
        signal_type: signalType,
        signal_data: signalData,
      });
    },
    [currentUserId],
  );

  const upsertRemoteCameraStream = useCallback((userId: string, userName: string, stream: MediaStream) => {
    setRemoteStreams((prev) => {
      const filtered = prev.filter((item) => !(item.peerId === userId && item.type === "camera"));
      return [...filtered, { peerId: userId, peerName: userName, stream, type: "camera" }];
    });
  }, []);

  const removeRemoteCameraStream = useCallback((userId: string) => {
    remoteCameraStreamsRef.current.delete(userId);
    setRemoteStreams((prev) => prev.filter((item) => !(item.peerId === userId && item.type === "camera")));
  }, []);

  const cleanupPeer = useCallback(
    (userId: string) => {
      const peer = peersRef.current.get(userId);
      if (peer) {
        peer.pc.ontrack = null;
        peer.pc.onicecandidate = null;
        peer.pc.onconnectionstatechange = null;
        peer.pc.close();
        peersRef.current.delete(userId);
      }

      removeRemoteCameraStream(userId);

      const screenPeer = screenPeersRef.current.get(userId);
      if (screenPeer) {
        screenPeer.close();
        screenPeersRef.current.delete(userId);
      }

      setRemoteStreams((prev) => prev.filter((item) => item.peerId !== userId));
    },
    [removeRemoteCameraStream],
  );

  const cleanupAll = useCallback(() => {
    peersRef.current.forEach((peer) => {
      peer.pc.close();
    });
    peersRef.current.clear();

    remoteCameraStreamsRef.current.clear();

    screenPeersRef.current.forEach((pc) => pc.close());
    screenPeersRef.current.clear();

    setRemoteStreams([]);

    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
      setScreenSharing(false);
    }
  }, []);

  const applyLocalTracksToPeer = useCallback(
    async (peer: PeerConnection) => {
      const audioTrack = localAudioStream?.getAudioTracks()[0] ?? null;
      const videoTrack = localCameraStream?.getVideoTracks()[0] ?? null;

      await Promise.allSettled([
        peer.audioSender.replaceTrack(audioTrack),
        peer.videoSender.replaceTrack(videoTrack),
      ]);
    },
    [localAudioStream, localCameraStream],
  );

  const flushPendingIceCandidates = useCallback(async (peer: PeerConnection) => {
    if (!peer.pc.remoteDescription) return;

    const pending = [...peer.pendingIceCandidates];
    peer.pendingIceCandidates = [];

    for (const candidate of pending) {
      try {
        await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
      }
    }
  }, []);

  const ensurePeerConnection = useCallback(
    async (remoteUserId: string, remoteUserName: string) => {
      const existing = peersRef.current.get(remoteUserId);
      if (existing) {
        existing.userName = remoteUserName;
        await applyLocalTracksToPeer(existing);
        return existing;
      }

      const pc = new RTCPeerConnection(ICE_SERVERS);
      const audioSender = pc.addTransceiver("audio", { direction: "sendrecv" }).sender;
      const videoSender = pc.addTransceiver("video", { direction: "sendrecv" }).sender;

      const peer: PeerConnection = {
        pc,
        userId: remoteUserId,
        userName: remoteUserName,
        audioSender,
        videoSender,
        makingOffer: false,
        ignoreOffer: false,
        isSettingRemoteAnswerPending: false,
        pendingIceCandidates: [],
      };

      peersRef.current.set(remoteUserId, peer);
      await applyLocalTracksToPeer(peer);

      pc.ontrack = (event) => {
        const stream = remoteCameraStreamsRef.current.get(remoteUserId) ?? new MediaStream();
        remoteCameraStreamsRef.current.set(remoteUserId, stream);

        const tracks = event.streams[0]?.getTracks().length ? event.streams[0].getTracks() : [event.track];

        tracks.forEach((track) => {
          const alreadyExists = stream.getTracks().some((existingTrack) => existingTrack.id === track.id);
          if (!alreadyExists) {
            stream.addTrack(track);
          }

          track.onended = () => {
            stream.removeTrack(track);

            if (stream.getTracks().length === 0) {
              removeRemoteCameraStream(remoteUserId);
              return;
            }

            upsertRemoteCameraStream(remoteUserId, peer.userName, stream);
          };
        });

        upsertRemoteCameraStream(remoteUserId, peer.userName, stream);
      };

      pc.onicecandidate = (event) => {
        if (!event.candidate) return;

        sendSignal(remoteUserId, "ice-candidate", {
          candidate: event.candidate.toJSON(),
        }).catch(() => {});
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          cleanupPeer(remoteUserId);
        }
      };

      return peer;
    },
    [applyLocalTracksToPeer, cleanupPeer, removeRemoteCameraStream, sendSignal, upsertRemoteCameraStream],
  );

  const negotiatePeer = useCallback(
    async (remoteUserId: string) => {
      const peer = peersRef.current.get(remoteUserId);
      if (!peer || peer.makingOffer || peer.pc.signalingState !== "stable") return;

      try {
        peer.makingOffer = true;
        await applyLocalTracksToPeer(peer);

        const offer = await peer.pc.createOffer();
        if (peer.pc.signalingState !== "stable") return;

        await peer.pc.setLocalDescription(offer);

        await sendSignal(remoteUserId, "offer", {
          sdp: offer.sdp,
          type: offer.type,
          userName: currentUserName,
        });
      } catch {
      } finally {
        peer.makingOffer = false;
      }
    },
    [applyLocalTracksToPeer, currentUserName, sendSignal],
  );

  const handleSignal = useCallback(
    async (signal: any) => {
      if (!currentUserId || signal.to_user_id !== currentUserId) return;

      const fromUserId = signal.from_user_id as string;
      const signalType = signal.signal_type as string;
      const data = signal.signal_data as any;

      try {
        if (signalType === "offer" || signalType === "answer") {
          const peer = await ensurePeerConnection(fromUserId, data.userName || "Colega");
          const description = new RTCSessionDescription({ sdp: data.sdp, type: data.type });
          const readyForOffer =
            !peer.makingOffer &&
            (peer.pc.signalingState === "stable" || peer.isSettingRemoteAnswerPending);
          const offerCollision = description.type === "offer" && !readyForOffer;

          peer.ignoreOffer = !isPolitePeer(fromUserId) && offerCollision;
          if (peer.ignoreOffer) return;

          peer.isSettingRemoteAnswerPending = description.type === "answer";
          await peer.pc.setRemoteDescription(description);
          peer.isSettingRemoteAnswerPending = false;

          await flushPendingIceCandidates(peer);

          if (description.type === "offer") {
            await applyLocalTracksToPeer(peer);

            const answer = await peer.pc.createAnswer();
            await peer.pc.setLocalDescription(answer);

            await sendSignal(fromUserId, "answer", {
              sdp: answer.sdp,
              type: answer.type,
              userName: currentUserName,
            });
          }
        } else if (signalType === "ice-candidate") {
          const peer = peersRef.current.get(fromUserId) ?? await ensurePeerConnection(fromUserId, data.userName || "Colega");
          if (!data.candidate || peer.ignoreOffer) return;

          if (peer.pc.remoteDescription) {
            try {
              await peer.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch {
            }
          } else {
            peer.pendingIceCandidates.push(data.candidate);
          }
        } else if (signalType === "screen-offer") {
          const existingScreenPeer = screenPeersRef.current.get(fromUserId);
          if (existingScreenPeer) {
            existingScreenPeer.close();
          }

          const pc = new RTCPeerConnection(ICE_SERVERS);
          screenPeersRef.current.set(fromUserId, pc);

          pc.ontrack = (event) => {
            const [stream] = event.streams;
            if (!stream) return;

            setRemoteStreams((prev) => {
              const filtered = prev.filter((item) => !(item.peerId === fromUserId && item.type === "screen"));
              return [...filtered, { peerId: fromUserId, peerName: data.userName || "Colega", stream, type: "screen" }];
            });
          };

          pc.onicecandidate = (event) => {
            if (!event.candidate) return;
            sendSignal(fromUserId, "screen-ice-candidate", { candidate: event.candidate.toJSON() }).catch(() => {});
          };

          pc.onconnectionstatechange = () => {
            if (pc.connectionState === "failed" || pc.connectionState === "closed") {
              setRemoteStreams((prev) => prev.filter((item) => !(item.peerId === fromUserId && item.type === "screen")));
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
            try {
              await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch {
            }
          }
        } else if (signalType === "screen-stop") {
          setRemoteStreams((prev) => prev.filter((item) => !(item.peerId === fromUserId && item.type === "screen")));
          const pc = screenPeersRef.current.get(fromUserId);
          if (pc) {
            pc.close();
            screenPeersRef.current.delete(fromUserId);
          }
        }
      } finally {
        await supabase.from("webrtc_signals").delete().eq("id", signal.id);
      }
    },
    [
      applyLocalTracksToPeer,
      currentUserId,
      currentUserName,
      ensurePeerConnection,
      flushPendingIceCandidates,
      isPolitePeer,
      sendSignal,
    ],
  );

  useEffect(() => {
    if (!roomId || !currentUserId) return;

    const processPendingSignals = async () => {
      const { data } = await supabase
        .from("webrtc_signals")
        .select("*")
        .eq("to_user_id", currentUserId)
        .eq("room_id", roomId)
        .order("created_at", { ascending: true });

      if (!data?.length) return;

      for (const signal of data) {
        await handleSignal(signal);
      }
    };

    processPendingSignals();

    const channel = supabase
      .channel(`webrtc-signals-${roomId}-${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "webrtc_signals",
          filter: `to_user_id=eq.${currentUserId}`,
        },
        (payload) => {
          handleSignal(payload.new).catch(() => {});
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, currentUserId, handleSignal]);

  useEffect(() => {
    if (!roomId || !currentUserId) return;

    const otherUsers = usersInRoom.filter((user) => user.user_id !== currentUserId);

    otherUsers.forEach((user) => {
      ensurePeerConnection(user.user_id, user.user_name)
        .then(() => {
          if (currentUserId > user.user_id) {
            return negotiatePeer(user.user_id);
          }

          return undefined;
        })
        .catch(() => {});
    });

    const otherIds = new Set(otherUsers.map((user) => user.user_id));
    peersRef.current.forEach((_, userId) => {
      if (!otherIds.has(userId)) {
        cleanupPeer(userId);
      }
    });
  }, [roomId, currentUserId, usersInRoom, ensurePeerConnection, negotiatePeer, cleanupPeer]);

  useEffect(() => {
    const nextTrackIds = {
      audio: localAudioStream?.getAudioTracks()[0]?.id ?? null,
      video: localCameraStream?.getVideoTracks()[0]?.id ?? null,
    };

    const trackChanged =
      lastLocalTrackIdsRef.current.audio !== nextTrackIds.audio ||
      lastLocalTrackIdsRef.current.video !== nextTrackIds.video;

    lastLocalTrackIdsRef.current = nextTrackIds;

    peersRef.current.forEach((peer) => {
      applyLocalTracksToPeer(peer).catch(() => {});
    });

    if (!trackChanged) return;

    peersRef.current.forEach((peer) => {
      negotiatePeer(peer.userId).catch(() => {});
    });
  }, [localAudioStream, localCameraStream, applyLocalTracksToPeer, negotiatePeer]);

  useEffect(() => {
    if (!roomId) {
      cleanupAll();
    }
  }, [roomId, cleanupAll]);

  useEffect(() => {
    return () => {
      cleanupAll();
    };
  }, [cleanupAll]);

  const startScreenShare = useCallback(async () => {
    if (!currentUserId || !roomId) return;

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      screenStreamRef.current = stream;
      setScreenSharing(true);

      const otherUsers = usersInRoom.filter((user) => user.user_id !== currentUserId);

      for (const user of otherUsers) {
        const existingScreenPeer = screenPeersRef.current.get(user.user_id);
        if (existingScreenPeer) {
          existingScreenPeer.close();
        }

        const pc = new RTCPeerConnection(ICE_SERVERS);
        screenPeersRef.current.set(user.user_id, pc);

        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        pc.onicecandidate = (event) => {
          if (!event.candidate) return;
          sendSignal(user.user_id, "screen-ice-candidate", { candidate: event.candidate.toJSON() }).catch(() => {});
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        await sendSignal(user.user_id, "screen-offer", {
          sdp: offer.sdp,
          type: offer.type,
          userName: currentUserName,
        });
      }

      stream.getVideoTracks()[0].onended = () => {
        stopScreenShare();
      };
    } catch {
    }
  }, [currentUserId, roomId, usersInRoom, sendSignal, currentUserName]);

  const stopScreenShare = useCallback(() => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
    }

    setScreenSharing(false);

    screenPeersRef.current.forEach((pc, userId) => {
      pc.close();
      sendSignal(userId, "screen-stop", {}).catch(() => {});
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
