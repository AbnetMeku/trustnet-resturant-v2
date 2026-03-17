import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useBranding } from '@/hooks/useBranding';

export default function Login() {
  const { login } = useAuth();
  const branding = useBranding();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await axios.post('/api/auth/login', {
        username,
        password,
      });

      const { user: userData, access_token } = res.data;
      login(userData, access_token);

      switch (userData.role) {
        case 'admin':
          navigate('/admin');
          break;
        case 'manager':
          navigate('/manager');
          break;
        case 'cashier':
          navigate('/cashier');
          break;
        default:
          navigate('/login');
      }
    } catch (err) {
      setError(err.response?.data?.msg || 'Login failed');
      setPassword('');
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 md:p-8">
      {/* Background */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url('${branding.background_url}')` }}
      ></div>
      <div className="absolute inset-0 bg-black opacity-60"></div>

      {/* Login Card */}
      <form
        onSubmit={handleSubmit}
        className="relative z-10 bg-white/20 backdrop-blur-md shadow-2xl rounded-xl p-6 md:p-10 w-full max-w-xs md:max-w-sm transform transition-transform duration-500 ease-out scale-95 animate-fade-in flex flex-col items-center"
      >
        <img src={branding.logo_url} alt="TrustNet Logo" className="w-20 md:w-24 mx-auto mb-6 object-contain" />
        <h2 className="text-2xl md:text-3xl font-bold mb-6 text-center text-white">
          Sign In
        </h2>

        {error && (
          <p className="text-red-500 text-center mb-4 text-sm md:text-base">{error}</p>
        )}

        <div className="mb-4 w-full">
          <label className="block text-white font-medium mb-2">Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="መለያ ቁጥር ወይም ስም"
            required
            data-testid="login-username"
            className="w-full px-4 py-2 border border-white/30 rounded-lg bg-white/10 text-white placeholder-white/70 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <div className="mb-6 w-full">
          <label className="block text-white font-medium mb-2">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="ሚስጥር ቁጥር"
            required
            data-testid="login-password"
            className="w-full px-4 py-2 border border-white/30 rounded-lg bg-white/10 text-white placeholder-white/70 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <button
          type="submit"
          data-testid="login-submit"
          className="w-full bg-blue-600/80 hover:bg-blue-700/80 text-white font-semibold py-2 rounded-lg transition-colors"
        >
          Login | ግባ
        </button>
      </form>
    </div>
  );
}
