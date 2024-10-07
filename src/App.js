// src/App.js
import React from 'react';
import RoomInput from './components/RoomInput';
import VideoCall from './components/VideoCall';
import { Routes, Route } from 'react-router-dom';

function App() {
    return (
        <Routes>
            <Route path="/" element={<RoomInput />} />
            <Route path="/video-call/:roomId" element={<VideoCall />} />
            {/* 추가적인 Route 정의 */}
        </Routes>
    );
}

export default App;
