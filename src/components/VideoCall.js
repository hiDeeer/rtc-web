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
            { urls: 'stun:stun.l.google.com:19302' },
            {
                urls: 'turn:https://hideeer.p-e.kr:3478',
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

        socketRef.current.on('offer', handleOffer);
        socketRef.current.on('answer', handleAnswer);
        socketRef.current.on('ice-candidate', handleRemoteIceCandidate);
        socketRef.current.on('disconnect', handleDisconnect);
        socketRef.current.on('error', handleError);
    };

    const handleDisconnect = () => {
        console.log('WebSocket connection closed');
        setCallStatus('WebSocket 연결 종료. 재연결 시도 중...');
        setTimeout(connectWebSocket, 3000);
    };

    const handleError = (error) => {
        console.error('WebSocket error:', error);
        setCallStatus('오류 발생: ' + (error.message || '알 수 없는 오류'));
    };

    const startLocalStream = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideoRef.current.srcObject = stream;
            return stream;
        } catch (err) {
            console.error('Error accessing media devices.', err);
            setCallStatus('미디어 장치 접근 오류');
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

        console.log("Starting local stream...");
        const localStream = await startLocalStream();
        if (!localStream) return;

        console.log("Local stream started:", localStream);

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
            setCallStatus('오류 발생: 통화 시작 실패');
            isCallingRef.current = false;
        }
    };

    const handleOffer = async ({ offer }) => {
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
            setCallStatus('오류 발생: 제안 처리 실패');
        }
    };

    const handleAnswer = async ({ answer }) => {
        if (!localConnection) {
            console.error('Local connection is not established');
            setCallStatus('오류 발생: 로컬 연결이 없습니다');
            return;
        }

        try {
            await localConnection.setRemoteDescription(new RTCSessionDescription(answer));
            candidateQueue.current.forEach(candidate => {
                localConnection.addIceCandidate(new RTCIceCandidate(candidate)).catch(err => {
                    console.error('Error adding queued ICE candidate:', err);
                });
            });
            candidateQueue.current = [];
        } catch (error) {
            console.error('Error handling answer:', error);
            setCallStatus('오류 발생: 응답 처리 실패');
        }
    };

    const handleRemoteIceCandidate = (candidate) => {
        if (remoteConnection) {
            remoteConnection.addIceCandidate(new RTCIceCandidate(candidate)).catch(err => {
                console.error('Error adding remote ICE candidate:', err);
            });
        } else {
            candidateQueue.current.push(candidate);
            console.log("Candidate queued:", candidate);
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
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <video ref={localVideoRef} autoPlay playsInline muted style={{ width: '300px', border: '1px solid black' }} />
                <video ref={remoteVideoRef} autoPlay playsInline style={{ width: '300px', border: '1px solid black' }} />
            </div>
            <p>{callStatus}</p>
            <button onClick={startCall}>통화 시작</button>
            <button onClick={stopCall}>통화 종료</button>
        </div>
    );
};

export default VideoCall;
