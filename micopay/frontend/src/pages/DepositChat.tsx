import { useState, useRef, useEffect } from 'react';
import { useChatMessages } from '../hooks/useChatMessages';

interface DepositChatProps {
    tradeId: string;
    userId: string;
    onBack: () => void;
    onViewQR: () => void;
    lockTxHash?: string | null;
    apiBaseUrl?: string;
}

const STELLAR_EXPLORER = 'https://stellar.expert/explorer/testnet/tx';

const DepositChat = ({ 
    tradeId,
    userId,
    onBack, 
    onViewQR, 
    lockTxHash,
    apiBaseUrl = 'http://localhost:3000'
}: DepositChatProps) => {
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
        <div className="bg-surface font-body text-on-surface min-h-screen flex flex-col">
            {/* TopAppBar */}
            <header className="flex items-center justify-between px-6 py-4 pt-[max(1rem,env(safe-area-inset-top))] w-full sticky top-0 z-50 bg-[#F4FAFF] border-b border-[#E7F6FF]">
                <div className="flex items-center gap-4">
                    <button 
                        onClick={onBack}
                        className="flex items-center justify-center p-2 text-[#00694C] hover:bg-[#E7F6FF] transition-colors rounded-full active:scale-95 duration-150"
                    >
                        <span className="material-symbols-outlined">arrow_back</span>
                    </button>
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                            <h1 className="font-headline font-bold text-lg tracking-tight text-[#0B1E26]">Tienda Don Pepe</h1>
                            <span className="bg-primary/10 text-primary text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 border border-primary/20">
                                <span className="material-symbols-outlined !text-[12px]" style={{ fontVariationSettings: '"FILL" 1' }}>verified</span>
                                VERIFICADO
                            </span>
                        </div>
                        <span className="text-xs text-on-surface/60 font-medium">Agente Autorizado</span>
                    </div>
                </div>
                <button className="p-2 text-[#0B1E26] opacity-70 hover:bg-[#E7F6FF] transition-colors rounded-full">
                    <span className="material-symbols-outlined">more_vert</span>
                </button>
            </header>

            <main className="flex-1 max-w-2xl mx-auto flex flex-col w-full bg-[radial-gradient(circle_at_2px_2px,rgba(0,105,76,0.03)_1px,transparent_0)] bg-[length:24px_24px]">
                {/* Status Banner */}
                <section className="px-6 py-4">
                    <div className="bg-white border border-primary/10 shadow-sm rounded-2xl p-4 flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                            <span className="material-symbols-outlined" style={{ fontVariationSettings: '"FILL" 1' }}>task_alt</span>
                        </div>
                        <div className="flex flex-col gap-1 min-w-0">
                            <p className="text-sm font-bold text-primary font-headline">Oferta aceptada · Saldo bloqueado en escrow</p>
                            <p className="text-xs text-on-surface/60">Tu depósito está protegido por el contrato inteligente.</p>
                            {lockTxHash ? (
                                <a
                                    href={`${STELLAR_EXPLORER}/${lockTxHash}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-xs text-primary/70 hover:text-primary transition-colors font-mono truncate mt-1"
                                >
                                    <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                                    Ver en Stellar Testnet
                                    <span className="truncate opacity-60">· {lockTxHash.substring(0, 12)}…</span>
                                </a>
                            ) : (
                                <p className="text-xs text-on-surface/40 mt-1">Confirmando en blockchain…</p>
                            )}
                        </div>
                    </div>
                </section>

                {/* Loading State */}
                {isLoading && (
                    <div className="flex items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                )}

                {/* Error State with Retry */}
                {error && !isLoading && (
                    <div className="px-6 py-4">
                        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
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
                    </div>
                )}

                {/* Message List */}
                <div className="flex-grow px-6 py-4 flex flex-col gap-6">
                    {!isLoading && messages.length > 0 && (
                        <div className="flex justify-center">
                            <span className="bg-surface-container-low text-on-surface/40 text-[10px] font-bold tracking-widest px-3 py-1 rounded-full uppercase">Hoy</span>
                        </div>
                    )}

                    {!isLoading && !error && messages.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <span className="material-symbols-outlined text-[48px] text-outline/40 mb-3">chat_bubble</span>
                            <p className="text-sm text-on-surface/60 font-medium">No messages yet</p>
                            <p className="text-xs text-on-surface/40 mt-1">Start the conversation</p>
                        </div>
                    )}

                    {messages.map((msg) => (
                        <div 
                            key={msg.id}
                            className={`flex flex-col gap-2 ${msg.isOwn ? 'max-w-[85%] self-end' : 'max-w-[85%] self-start'}`}
                        >
                            <div className={`p-4 shadow-sm border ${
                                msg.isOwn
                                    ? 'bg-primary text-white rounded-tl-2xl rounded-bl-2xl rounded-br-2xl border-primary shadow-md' 
                                    : 'bg-white text-on-surface rounded-tr-2xl rounded-bl-2xl rounded-br-2xl border-surface-container-high'
                            }`}>
                                <p className="text-[15px] leading-relaxed">{msg.body}</p>
                            </div>
                            <div className={`flex items-center gap-1 mt-1 px-1 ${msg.isOwn ? 'justify-end' : ''}`}>
                                <span className="text-[10px] text-on-surface/40 font-semibold">
                                    {new Date(msg.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                </span>
                                {msg.isOwn && (
                                    <span className="material-symbols-outlined !text-[12px] text-[#5DCAA5]" style={{ fontVariationSettings: msg.readAt ? '"FILL" 1' : '"FILL" 0' }}>done_all</span>
                                )}
                            </div>
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>

                {/* Footer / Input */}
                <footer className="sticky bottom-0 bg-white/80 backdrop-blur-xl px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-4 flex flex-col gap-4 border-t border-[#E7F6FF]">
                    <div className="grid grid-cols-2 gap-3">
                        <button className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-primary/20 bg-white text-primary font-bold text-sm hover:bg-surface-container-low transition-all active:scale-95 disabled:opacity-50" disabled={isSending}>
                            <span className="material-symbols-outlined !text-[20px]">location_on</span>
                            Compartir ubicación
                        </button>
                        <button 
                            onClick={onViewQR}
                            className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-primary to-primary-container text-white font-bold text-sm shadow-lg shadow-primary/20 hover:brightness-110 transition-all active:scale-95 disabled:opacity-50"
                            disabled={isSending}
                        >
                            <span className="material-symbols-outlined !text-[20px]">qr_code_2</span>
                            Ver mi QR de depósito
                        </button>
                    </div>
                    {sendError && (
                        <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                            Send failed: {sendError.message}
                        </div>
                    )}
                    <div className="flex items-center gap-3 bg-white border-b border-outline-variant/20 py-2">
                        <button className="p-2 text-primary/60 hover:text-primary transition-colors disabled:opacity-50" disabled={isSending}>
                            <span className="material-symbols-outlined">add_circle</span>
                        </button>
                        <div className="flex-grow">
                            <input 
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={handleKeyDown}
                                className="w-full bg-transparent border-none focus:ring-0 text-sm font-medium placeholder:text-on-surface/30 disabled:opacity-50" 
                                placeholder="Escribe un mensaje..." 
                                type="text"
                                disabled={isSending}
                            />
                        </div>
                        <button 
                            onClick={handleSendMessage}
                            disabled={isSending || !inputValue.trim()}
                            className="w-10 h-10 rounded-full bg-surface-container-low flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSending ? (
                                <div className="animate-spin rounded-full h-4 w-4 border-b border-current"></div>
                            ) : (
                                <span className="material-symbols-outlined" style={{ fontVariationSettings: '"FILL" 1' }}>send</span>
                            )}
                        </button>
                    </div>
                </footer>
            </main>
        </div>
    );
};

export default DepositChat;
