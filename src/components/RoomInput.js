// src/components/RoomInput.js
import React, { useState } from 'react';
import {useNavigate, useNavigation} from 'react-router-dom';

const RoomInput = () => {
    const [roomId, setRoomId] = useState('');
    const navigation = useNavigate();

    const handleInputChange = (event) => {
        setRoomId(event.target.value);
    };

    const handleJoinRoom = () => {
        if (roomId) {
            navigation(`/video-call/${roomId}`); // 방 ID를 URL에 추가하여 영상통화로 이동
        }
    };

    return (
        <div>
            <h2>방 코드 입력</h2>
            <input
                type="text"
                value={roomId}
                onChange={handleInputChange}
                placeholder="방 코드를 입력하세요"
            />
            <button onClick={handleJoinRoom}>방에 입장하기</button>
        </div>
    );
};

export default RoomInput;
