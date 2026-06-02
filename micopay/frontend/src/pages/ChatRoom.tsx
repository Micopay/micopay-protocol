import { useState, useRef, useEffect } from 'react';
import { useChatMessages } from '../hooks/useChatMessages';

interface ChatRoomProps {
    tradeId: string;
    userId: string;
    onBack: () => void;
    onViewQR: () => void;
    lockTxHash?: string | null;
    apiBaseUrl?: string;
}

const STELLAR_EXPLORER = 'https://stellar.expert/explorer/testnet/tx';

const ChatRoom = ({ 
    tradeId,
    userId,
    onBack, 
    onViewQR, 
    lockTxHash,
    apiBaseUrl = 'http://localhost:3000'
}: ChatRoomProps) => {
    const {
        messages,
        isLoading,
        error,
        sendMessage,
        isSending,
        sendError,
        retryLoad,
    } = useChatMessages({ tradeId, userId, apiBaseUrl });

    const [inputValue, setInputValue] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    
    // Auto-scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSendMessage = async () => {
        if (!inputValue.trim()) return;
        
        const messageBody = inputValue;
        setInputValue('');
        await sendMessage(messageBody);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

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
                        <p className="text-sm font-semibold text-primary">✓ Oferta aceptada · Saldo bloqueado en escrow</p>
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

                {/* Loading State */}
                {isLoading && (
                    <div className="flex items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                )}

                {/* Error State with Retry */}
                {error && !isLoading && (
                    <div className="my-4 p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3">
                        <span className="material-symbols-outlined text-red-600 text-lg">error</span>
                        <div className="flex flex-col gap-2 flex-1">
                            <p className="text-sm font-semibold text-red-700">Couldn't load messages</p>
                            <p className="text-xs text-red-600">{error.message}</p>
                            <button
                                onClick={retryLoad}
                                className="text-xs font-semibold text-red-700 hover:underline"
                            >
                                [Retry]
                            </button>
                        </div>
                    </div>
                )}

                {/* Date Separator */}
                {!isLoading && messages.length > 0 && (
                    <div className="flex justify-center my-6">
                        <span className="text-[11px] font-bold text-outline uppercase tracking-widest bg-surface-container-low px-3 py-1 rounded-full">
                            Hoy
                        </span>
                    </div>
                )}

                {/* Empty State */}
                {!isLoading && !error && messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <span className="material-symbols-outlined text-[48px] text-outline/40 mb-3">chat_bubble</span>
                        <p className="text-sm text-on-surface/60 font-medium">No messages yet</p>
                        <p className="text-xs text-on-surface/40 mt-1">Start the conversation</p>
                    </div>
                )}

                {/* Messages List */}
                <div className="flex flex-col gap-6">
                    {messages.map((msg) => (
                        <div 
                            key={msg.id}
                            className={`flex flex-col max-w-[85%] ${msg.isOwn ? 'items-end self-end' : 'items-start'}`}
                        >
                            <div className={`p-4 rounded-t-2xl shadow-sm relative ${
                                msg.isOwn
                                    ? 'bg-primary text-on-primary rounded-bl-2xl rounded-br-none shadow-md' 
                                    : 'bg-surface-container-low text-on-surface rounded-br-2xl rounded-bl-none'
                            }`}>
                                <p className="text-sm leading-relaxed">{msg.body}</p>
                                {msg.id.startsWith('temp-') && (
                                    <div className="absolute top-1 right-1">
                                        <div className="animate-spin rounded-full h-3 w-3 border-b border-current"></div>
                                    </div>
                                )}
                            </div>
                            <div className={`flex items-center gap-1 mt-1 px-1 ${msg.isOwn ? 'justify-end' : ''}`}>
                                <span className="text-[10px] text-outline font-medium">
                                    {new Date(msg.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                </span>
                                {msg.isOwn && (
                                    <span className="material-symbols-outlined text-[12px] text-primary" style={{ fontVariationSettings: msg.readAt ? '"FILL" 1' : '"FILL" 0' }}>
                                        done_all
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                    <div ref={messagesEndRef} />

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
                            <span className="font-body text-sm">Ver mi QR de intercambio</span>
                        </button>
                    </div>
                </div>
            </main>

            {/* Bottom Chat Input */}
            <div className="fixed bottom-0 w-full bg-surface/80 backdrop-blur-xl px-4 pt-3 pb-[max(2rem,env(safe-area-inset-bottom))] border-t border-surface-container">
                <div className="max-w-2xl mx-auto flex flex-col gap-2">
                    {sendError && (
                        <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                            Send failed: {sendError.message} <button onClick={() => {}} className="underline ml-1">[Retry]</button>
                        </div>
                    )}
                    <div className="flex items-end gap-3">
                        <button className="p-3 text-primary hover:bg-surface-container-low rounded-full transition-colors mb-0.5 disabled:opacity-50" disabled={isSending}>
                            <span className="material-symbols-outlined">add_circle</span>
                        </button>
                        <div className="flex-1 relative flex items-center">
                            <textarea 
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={handleKeyDown}
                                className="w-full bg-surface-container-low border-none focus:ring-2 focus:ring-primary rounded-2xl py-3 px-4 pr-12 text-sm text-on-surface placeholder:text-outline resize-none overflow-hidden disabled:opacity-50" 
                                placeholder="Escribe un mensaje..." 
                                rows={1}
                                disabled={isSending}
                            />
                            <button className="absolute right-2 p-2 text-primary">
                                <span className="material-symbols-outlined">mood</span>
                            </button>
                        </div>
                        <button 
                            onClick={handleSendMessage}
                            disabled={isSending || !inputValue.trim()}
                            className="w-11 h-11 bg-primary text-white rounded-full flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all mb-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSending ? (
                                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                            ) : (
                                <span className="material-symbols-outlined" style={{ fontVariationSettings: '"FILL" 1' }}>send</span>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ChatRoom;
