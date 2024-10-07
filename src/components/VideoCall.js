import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useParams } from 'react-router-dom';

const SOCKET_SERVER_URL = 'https://hideeer.p-e.kr'; // 서버 URL

const VideoCall = () => {
    const { roomId } = useParams();
    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const socketRef = useRef(null);
    const [localConnection, setLocalConnection] = useState(null);
    const [remoteConnection, setRemoteConnection] = useState(null);
    const [callStatus, setCallStatus] = useState('대기 중');

    const offerQueue = useRef([]);
    const answerQueue = useRef([]);
    const candidateQueue = useRef([]);
    const isCallingRef = useRef(false);

    const iceServers = {
        iceServers: [
            { urls: 'stun:hideeer.p-e.kr:3478' },
            {
                urls: 'turn:hideeer.p-e.kr:3478',
                username: "testuser",
                credential: "testpassword"
            }
        ]
    };

    const connectWebSocket = () => {
        socketRef.current = io(SOCKET_SERVER_URL);

        socketRef.current.on('connect', () => {
            console.log('WebSocket connection established:', socketRef.current.id);
            setCallStatus('연결됨');
            socketRef.current.emit('join-room', roomId);
        });

        socketRef.current.on('offer', (data) => {
            console.log('Offer received:', data);
            handleOffer(data);
        });

        socketRef.current.on('answer', (data) => {
            console.log('Answer received:', data);
            handleAnswer(data);
        });

        socketRef.current.on('ice-candidate', (candidate) => {
            console.log('ICE Candidate received:', candidate);
            handleRemoteIceCandidate(candidate);
        });

        socketRef.current.on('disconnect', () => {
            console.log('WebSocket connection closed');
            setCallStatus('WebSocket 연결 종료. 재연결 시도 중...');
            setTimeout(connectWebSocket, 3000);
        });

        socketRef.current.on('error', (error) => {
            console.error('WebSocket error:', error);
            setCallStatus('오류 발생: ' + (error.message || '알 수 없는 오류'));
        });
    };

    const startLocalStream = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideoRef.current.srcObject = stream;
            return stream;
        } catch (err) {
            console.error('Error accessing media devices.', err);
            return null;
        }
    };

    const createPeerConnection = () => {
        const peerConnection = new RTCPeerConnection(iceServers);

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('ICE Candidate generated:', event.candidate);
                socketRef.current.emit('ice-candidate', {
                    candidate: event.candidate,
                    roomId,
                });
            }
        };

        peerConnection.ontrack = (event) => {
            remoteVideoRef.current.srcObject = event.streams[0];
            console.log('Received remote stream:', event.streams[0]);
        };

        peerConnection.oniceconnectionstatechange = () => {
            console.log('ICE connection state:', peerConnection.iceConnectionState);
            setCallStatus(`ICE 상태: ${peerConnection.iceConnectionState}`);
        };

        return peerConnection;
    };

    const startCall = async () => {
        if (isCallingRef.current) return;
        isCallingRef.current = true;

        const localStream = await startLocalStream();
        if (!localStream) return;

        const localPeerConnection = createPeerConnection();
        localStream.getTracks().forEach(track => localPeerConnection.addTrack(track, localStream));
        setLocalConnection(localPeerConnection);

        try {
            const offer = await localPeerConnection.createOffer();
            await localPeerConnection.setLocalDescription(offer);
            socketRef.current.emit('offer', { offer, roomId });
            console.log('Offer sent:', offer);
            setCallStatus('통화 중');
        } catch (error) {
            console.error('Error creating offer:', error);
            isCallingRef.current = false;
        }
    };

    const handleOffer = async ({ offer, sender }) => {
        if (!offer || !offer.sdp || offer.type !== 'offer') {
            console.error('Invalid offer:', offer);
            return;
        }

        const newRemoteConnection = createPeerConnection();
        setRemoteConnection(newRemoteConnection);

        try {
            await newRemoteConnection.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await newRemoteConnection.createAnswer();
            await newRemoteConnection.setLocalDescription(answer);
            socketRef.current.emit('answer', { answer, roomId });
            console.log('Answer sent:', answer);
        } catch (error) {
            console.error('Error handling offer:', error);
        }
    };

    const handleAnswer = async ({ answer }) => {
        if (!localConnection) {
            console.error('Local connection is not established');
            return;
        }

        try {
            await localConnection.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (error) {
            console.error('Error handling answer:', error);
        }
    };

    const handleRemoteIceCandidate = (candidate) => {
        if (remoteConnection) {
            remoteConnection.addIceCandidate(new RTCIceCandidate(candidate)).catch(err => {
                console.error('Error adding remote ICE candidate:', err);
            });
        } else {
            candidateQueue.current.push(candidate);
        }
    };

    const stopCall = () => {
        if (localConnection) {
            localConnection.close();
            setLocalConnection(null);
        }
        if (remoteConnection) {
            remoteConnection.close();
            setRemoteConnection(null);
        }
        if (localVideoRef.current && localVideoRef.current.srcObject) {
            const tracks = localVideoRef.current.srcObject.getTracks();
            tracks.forEach(track => track.stop());
            localVideoRef.current.srcObject = null;
        }
        setCallStatus('통화 종료');
        isCallingRef.current = false;
    };

    useEffect(() => {
        connectWebSocket();
        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
            stopCall();
        };
    }, []);

    return (
        <div>
            <h2>Video Call</h2>
            <video ref={localVideoRef} autoPlay playsInline muted style={{ width: '300px' }} />
            <video ref={remoteVideoRef} autoPlay playsInline style={{ width: '300px' }} />
            <p>{callStatus}</p>
            <button onClick={startCall}>통화 시작</button>
            <button onClick={stopCall}>통화 종료</button>
        </div>
    );
};

export default VideoCall;
