import { useState } from 'react';
import { supabase } from './supabaseClient';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
    else alert('¡Inicio de sesión exitoso!');
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2>Login - GDA Sistema</h2>
      <form onSubmit={handleLogin}>
        <input type="email" placeholder="Email" onChange={(e) => setEmail(e.target.value)} /><br/>
        <input type="password" placeholder="Contraseña" onChange={(e) => setPassword(e.target.value)} /><br/>
        <button type="submit">Ingresar</button>
      </form>
    </div>
  );
}