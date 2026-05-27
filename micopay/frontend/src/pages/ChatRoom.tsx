import { useState } from 'react';

interface Message {
    id: string;
    text: string;
    sender: 'user' | 'agent';
    timestamp: string;
}

interface ChatRoomProps {
    onBack: () => void;
    onViewQR: () => void;
    lockTxHash?: string | null;
}

const STELLAR_EXPLORER = 'https://stellar.expert/explorer/testnet/tx';

const ChatRoom = ({ onBack, onViewQR, lockTxHash }: ChatRoomProps) => {
    const [messages] = useState<Message[]>([
        { id: '1', text: 'Buen día recibimos su solicitud.', sender: 'agent', timestamp: '09:41 AM' },
        { id: '2', text: 'Hola! Estoy aqui alado llego en un momento.', sender: 'user', timestamp: '09:43 AM' },
        { id: '3', text: 'Estamos en Av. Juárez 34, a un costado del banco.', sender: 'agent', timestamp: '09:44 AM' },
    ]);

    return (
        <div className="bg-background text-on-surface font-body min-h-screen flex flex-col">
            {/* TopAppBar */}
            <header className="fixed top-0 w-full z-50 flex items-center px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] justify-between bg-surface/80 backdrop-blur-md border-b border-surface-container">
                <div className="flex items-center gap-3">
                    <button 
                        onClick={onBack}
                        className="p-2 hover:bg-surface-container-low transition-colors rounded-full text-primary"
                    >
                        <span className="material-symbols-outlined">arrow_back</span>
                    </button>
                    <div className="flex items-center gap-2">
                        <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center text-white font-bold">
                            FG
                        </div>
                        <div>
                            <h1 className="font-headline font-bold text-lg tracking-tight leading-tight text-on-surface">
                                Farmacia Guadalupe
                            </h1>
                            <div className="flex items-center gap-1">
                                <span className="material-symbols-outlined text-sm text-primary" style={{ fontVariationSettings: '"FILL" 1' }}>
                                    verified
                                </span>
                                <span className="text-[10px] font-bold text-primary tracking-widest uppercase">Verificado</span>
                            </div>
                        </div>
                    </div>
                </div>
                <button className="p-2 hover:bg-surface-container-low transition-colors rounded-full text-primary">
                    <span className="material-symbols-outlined">more_vert</span>
                </button>
            </header>

            {/* Content Area */}
            <main className="flex-1 mt-[72px] mb-24 px-4 max-w-2xl mx-auto w-full flex flex-col">
                {/* Status Banner */}
                <div className="my-4 p-4 rounded-xl bg-primary-container/10 border border-primary/10 flex items-start gap-3">
                    <div className="bg-primary text-white rounded-full p-1 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="material-symbols-outlined text-sm">check</span>
                    </div>
                    <div className="flex flex-col gap-1 min-w-0">
                        <p className="text-sm font-semibold text-primary">✓ Oferta aceptada · Saldo bloqueado en garantía</p>
                        {lockTxHash ? (
                            <a
                                href={`${STELLAR_EXPLORER}/${lockTxHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-xs text-primary/70 hover:text-primary transition-colors font-mono truncate"
                            >
                                <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                                Ver en Stellar Testnet
                                <span className="truncate opacity-60">· {lockTxHash.substring(0, 12)}…</span>
                            </a>
                        ) : (
                            <p className="text-xs text-on-surface/40">Confirmando en blockchain…</p>
                        )}
                    </div>
                </div>

                {/* Date Separator */}
                <div className="flex justify-center my-6">
                    <span className="text-[11px] font-bold text-outline uppercase tracking-widest bg-surface-container-low px-3 py-1 rounded-full">
                        Hoy
                    </span>
                </div>

                {/* Messages List */}
                <div className="flex flex-col gap-6">
                    {messages.map((msg) => (
                        <div 
                            key={msg.id}
                            className={`flex flex-col max-w-[85%] ${msg.sender === 'user' ? 'items-end self-end' : 'items-start'}`}
                        >
                            <div className={`p-4 rounded-t-2xl shadow-sm ${
                                msg.sender === 'user' 
                                    ? 'bg-primary text-on-primary rounded-bl-2xl rounded-br-none shadow-md' 
                                    : 'bg-surface-container-low text-on-surface rounded-br-2xl rounded-bl-none'
                            }`}>
                                <p className="text-sm leading-relaxed">{msg.text}</p>
                            </div>
                            <div className={`flex items-center gap-1 mt-1 px-1 ${msg.sender === 'user' ? 'justify-end' : ''}`}>
                                <span className="text-[10px] text-outline font-medium">{msg.timestamp}</span>
                                {msg.sender === 'user' && (
                                    <span className="material-symbols-outlined text-[12px] text-primary">done_all</span>
                                )}
                            </div>
                        </div>
                    ))}

                    {/* Quick Actions Section */}
                    <div className="grid grid-cols-1 gap-3 mt-4">
                        <button className="flex items-center justify-center gap-3 w-full h-[46px] rounded-lg bg-surface-container-highest text-primary font-semibold hover:bg-surface-variant transition-colors group">
                            <span className="material-symbols-outlined group-hover:scale-110 transition-transform">location_on</span>
                            <span className="font-body text-sm">Compartir ubicación</span>
                        </button>
                        <button 
                            onClick={onViewQR}
                            className="flex items-center justify-center gap-3 w-full h-[46px] rounded-lg bg-primary text-white font-semibold hover:opacity-90 transition-opacity shadow-lg shadow-primary/20"
                        >
                            <span className="material-symbols-outlined">qr_code_2</span>
                            <span className="font-body text-sm">Ver mi QR de operación</span>
                        </button>
                    </div>
                </div>
            </main>

            {/* Bottom Chat Input */}
            <div className="fixed bottom-0 w-full bg-surface/80 backdrop-blur-xl px-4 pt-3 pb-[max(2rem,env(safe-area-inset-bottom))] border-t border-surface-container">
                <div className="max-w-2xl mx-auto flex items-end gap-3">
                    <button className="p-3 text-primary hover:bg-surface-container-low rounded-full transition-colors mb-0.5">
                        <span className="material-symbols-outlined">add_circle</span>
                    </button>
                    <div className="flex-1 relative flex items-center">
                        <textarea 
                            className="w-full bg-surface-container-low border-none focus:ring-2 focus:ring-primary rounded-2xl py-3 px-4 pr-12 text-sm text-on-surface placeholder:text-outline resize-none overflow-hidden" 
                            placeholder="Escribe un mensaje..." 
                            rows={1}
                        />
                        <button className="absolute right-2 p-2 text-primary">
                            <span className="material-symbols-outlined">mood</span>
                        </button>
                    </div>
                    <button className="w-11 h-11 bg-primary text-white rounded-full flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all mb-0.5">
                        <span className="material-symbols-outlined" style={{ fontVariationSettings: '"FILL" 1' }}>send</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ChatRoom;
