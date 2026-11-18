import React, { useState } from 'react';
import { Send, Bot } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
}

const SUGGESTED_PROMPTS = [
  'Buat ringkasan performa penjualan dan estimasi margin saat ini.',
  'Bahan baku apa saja yang stoknya menipis dan perlu segera di-restock?',
  'Outlet mana yang performanya paling baik dan apa rekomendasi operasionalnya?',
  'Apakah ada pembayaran non-tunai yang belum direkonsiliasi atau masih pending?',
];

export const AiAssistantView: React.FC = () => {
  const { activeOutletId, apiFetch, appUser } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: `Halo ${appUser?.fullName || 'Tim Operasional'}. Saya Asisten Bisnis KulinaHub. Saya hanya membaca data dari outlet yang sesuai hak akses Anda dan tidak mengeksekusi transaksi finansial tanpa konfirmasi manusia. Silakan ajukan pertanyaan tentang omzet, stok bahan baku, HPP, atau rekonsiliasi pembayaran.`,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const sendPrompt = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = { id: `u-${Date.now()}`, sender: 'user', text: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await apiFetch<{ reply: string }>('/api/ai/assistant', {
        method: 'POST',
        body: JSON.stringify({ prompt: trimmed, outletId: activeOutletId }),
      });
      setMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, sender: 'assistant', text: res.reply },
      ]);
    } catch (err: unknown) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'assistant',
          text: err instanceof Error ? err.message : 'Gagal menghubungi AI Business Assistant.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900">
          AI Business Assistant
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Analisis performa outlet, tren penjualan, stok kritis, dan rekomendasi operasional berbasis data PostgreSQL terotorisasi.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col min-h-[540px]">
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex flex-wrap gap-2">
          {SUGGESTED_PROMPTS.map((q) => (
            <button
              key={q}
              type="button"
              disabled={loading}
              onClick={() => sendPrompt(q)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 hover:border-emerald-600 hover:text-emerald-800 transition-colors text-left cursor-pointer"
            >
              {q}
            </button>
          ))}
        </div>

        <div className="flex-1 p-5 space-y-4 overflow-y-auto max-h-[440px]">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-2xl rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                  m.sender === 'user'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-50 border border-slate-200 text-slate-800'
                }`}
              >
                {m.sender === 'assistant' && (
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 mb-1">
                    <Bot className="w-3.5 h-3.5" />
                    <span>Asisten Bisnis</span>
                  </div>
                )}
                {m.text}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="rounded-xl px-4 py-3 text-xs text-slate-500 bg-slate-50 border border-slate-200">
                Menganalisis data transaksi dan stok outlet...
              </div>
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendPrompt(input);
          }}
          className="p-4 border-t border-slate-200 flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Tanyakan ringkasan omzet, kebutuhan restock, atau performa outlet..."
            className="flex-1 min-h-[44px] px-3.5 py-2 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="min-h-[44px] px-4 py-2 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>Kirim</span>
          </button>
        </form>
      </div>
    </div>
  );
};
