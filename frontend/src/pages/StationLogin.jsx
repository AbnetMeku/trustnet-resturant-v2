import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { FaBackspace } from 'react-icons/fa';

export default function StationLogin() {
  const { loginStation } = useAuth();
  const navigate = useNavigate();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const stationData = JSON.parse(localStorage.getItem('station'));
    if (stationData) navigate('/kds'); // auto-redirect if already logged in
  }, [navigate]);

  const handleDigit = (digit) => {
    if (pin.length < 4) {
      const newPin = pin + digit;
      setPin(newPin);
      if (newPin.length === 4) handleSubmit(newPin); // auto-login on 4th digit
    }
  };

  const handleDelete = () => setPin(pin.slice(0, -1));

const handleSubmit = async (submittedPin = pin) => {
  if (submittedPin.length !== 4) {
    setError('PIN must be 4 digits');
    return;
  }
  setError('');

  try {
    const res = await axios.post(
      '/api/auth/pin/station',
      { pin: submittedPin }
    );

    // Separate token from station object
    const stationData = {
      id: res.data.station.id,
      name: res.data.station.name,
      role: res.data.station.role
    };

    loginStation(stationData, res.data.access_token); // ✅ pass token as 2nd arg
    navigate('/kds');
  } catch (err) {
    setError(err.response?.data?.msg || 'Invalid PIN');
    setPin('');
  }
};


  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 md:p-8">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('/Background.jpeg')" }}></div>
      <div className="absolute inset-0 bg-black opacity-60"></div>

      <div className="relative z-10 bg-white/20 backdrop-blur-md shadow-2xl rounded-xl p-6 md:p-10 w-full max-w-xs md:max-w-sm flex flex-col items-center">
        <img src="/logo.png" alt="TrustNet Logo" className="w-20 md:w-24 mx-auto mb-6" />
        <h2 className="text-2xl md:text-3xl font-bold mb-4 text-center text-white">ማዘጋጃ ስፍራ ቁጥር</h2>
        {error && <p className="text-red-500 text-center mb-4 text-sm md:text-base">{error}</p>}

        {/* PIN display */}
        <div className="flex justify-center items-center mb-6 space-x-2 relative w-full max-w-xs md:max-w-sm">
          {Array.from({ length: pin.length }).map((_, i) => (
            <span key={i} className="w-6 h-6 md:w-8 md:h-8 bg-white rounded-full"></span>
          ))}
          {Array.from({ length: 4 - pin.length }).map((_, i) => (
            <span key={i} className="w-6 h-6 md:w-8 md:h-8 bg-white/30 rounded-full"></span>
          ))}
          {pin && (
            <FaBackspace
              className="absolute right-0 text-white cursor-pointer hover:text-red-400"
              size={28}
              onClick={handleDelete}
            />
          )}
        </div>

        {/* Numeric Keypad */}
        <div className="grid grid-cols-3 gap-3 md:gap-4 w-full max-w-xs md:max-w-sm">
          {[1,2,3,4,5,6,7,8,9].map((n) => (
            <button
              key={n}
              onClick={() => handleDigit(n.toString())}
              className="bg-white/20 text-white font-bold py-4 md:py-5 rounded-lg hover:bg-white/40 transition text-lg md:text-xl"
            >
              {n}
            </button>
          ))}
          <div></div>
          <button
            onClick={() => handleDigit('0')}
            className="bg-white/20 text-white font-bold py-4 md:py-5 rounded-lg hover:bg-white/40 transition text-lg md:text-xl"
          >
            0
          </button>
          <div></div>
        </div>
      </div>
    </div>
  );
}
