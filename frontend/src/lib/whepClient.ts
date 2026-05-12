export interface WhepSession {
  close: () => Promise<void>;
}

interface StartWhepPlaybackOptions {
  whepUrl: string;
  videoElement: HTMLVideoElement;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  cleanupMode?: "peer-only" | "delete-then-peer";
  playoutDelayMs?: number;
}

function applyVideoPlayoutDelay(receiver: RTCRtpReceiver, playoutDelayMs: number): void {
  if (playoutDelayMs <= 0) {
    return;
  }

  const delaySeconds = playoutDelayMs / 1000;
  const receiverWithHints = receiver as RTCRtpReceiver & {
    playoutDelayHint?: number;
    jitterBufferTarget?: number;
  };

  if ("playoutDelayHint" in receiverWithHints) {
    receiverWithHints.playoutDelayHint = delaySeconds;
  }

  if ("jitterBufferTarget" in receiverWithHints) {
    receiverWithHints.jitterBufferTarget = Math.round(playoutDelayMs);
  }
}

async function ensurePlaying(videoElement: HTMLVideoElement): Promise<void> {
  try {
    await videoElement.play();
  } catch {
    // Browser can reject transiently during stream switches. Ignore and retry on future events.
  }
}

async function waitForIceGathering(peerConnection: RTCPeerConnection, timeoutMs: number): Promise<void> {
  if (peerConnection.iceGatheringState === "complete") {
    return;
  }

  await new Promise<void>((resolve) => {
    const timeout = window.setTimeout(() => {
      peerConnection.removeEventListener("icegatheringstatechange", onStateChange);
      resolve();
    }, timeoutMs);

    const onStateChange = () => {
      if (peerConnection.iceGatheringState === "complete") {
        window.clearTimeout(timeout);
        peerConnection.removeEventListener("icegatheringstatechange", onStateChange);
        resolve();
      }
    };

    peerConnection.addEventListener("icegatheringstatechange", onStateChange);
  });
}

function resolveDeleteUrl(baseUrl: string, locationHeader: string | null): string | undefined {
  if (!locationHeader) {
    return undefined;
  }

  try {
    return new URL(locationHeader, baseUrl).toString();
  } catch {
    return undefined;
  }
}

export async function startWhepPlayback({
  whepUrl,
  videoElement,
  onConnectionStateChange,
  cleanupMode = "peer-only",
  playoutDelayMs = 0,
}: StartWhepPlaybackOptions): Promise<WhepSession> {
  const peerConnection = new RTCPeerConnection({ iceServers: [] });

  try {
    const fallbackStream = new MediaStream();
    videoElement.srcObject = fallbackStream;

    const videoTransceiver = peerConnection.addTransceiver("video", { direction: "recvonly" });
    applyVideoPlayoutDelay(videoTransceiver.receiver, playoutDelayMs);

    peerConnection.ontrack = (event) => {
      applyVideoPlayoutDelay(event.receiver, playoutDelayMs);

      const attachAndPlay = (stream: MediaStream) => {
        if (videoElement.srcObject !== stream) {
          videoElement.srcObject = stream;
        }

        void ensurePlaying(videoElement);
      };

      const sourceStream = event.streams[0];
      if (sourceStream && sourceStream.getTracks().length > 0) {
        attachAndPlay(sourceStream);

        event.track.onunmute = () => {
          attachAndPlay(sourceStream);
        };

        event.track.onended = () => {
          void ensurePlaying(videoElement);
        };

        return;
      }

      const exists = fallbackStream
        .getTracks()
        .some((track) => track.id === event.track.id);
      if (!exists) {
        fallbackStream.addTrack(event.track);
      }

      attachAndPlay(fallbackStream);

      event.track.onunmute = () => {
        attachAndPlay(fallbackStream);
      };
    };

    if (onConnectionStateChange) {
      peerConnection.onconnectionstatechange = () => {
        onConnectionStateChange(peerConnection.connectionState);
      };
    }

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    await waitForIceGathering(peerConnection, 3000);

    const localSdp = peerConnection.localDescription?.sdp;
    if (!localSdp) {
      throw new Error("Local SDP was not created.");
    }

    const response = await fetch(whepUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/sdp",
      },
      body: localSdp,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`WHEP negotiation failed (${response.status}): ${text}`);
    }

    const deleteUrl = resolveDeleteUrl(whepUrl, response.headers.get("location"));
    const answerSdp = await response.text();

    await peerConnection.setRemoteDescription({ type: "answer", sdp: answerSdp });
    await ensurePlaying(videoElement);

    let isClosed = false;

    return {
      async close() {
        if (isClosed) {
          return;
        }

        isClosed = true;

        if (cleanupMode === "delete-then-peer" && deleteUrl) {
          try {
            await fetch(deleteUrl, { method: "DELETE" });
          } catch {
            // Ignore cleanup failures. MediaMTX will still release resources on peer close.
          }
        }

        try {
          peerConnection.close();
        } finally {
          videoElement.srcObject = null;
        }
      },
    };
  } catch (err) {
    try {
      peerConnection.close();
    } finally {
      videoElement.srcObject = null;
    }

    throw err;
  }
}
