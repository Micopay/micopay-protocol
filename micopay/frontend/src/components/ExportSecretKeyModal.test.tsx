import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import ExportSecretKeyModal from './ExportSecretKeyModal';
import { exportSecretKey } from '../lib/keystore';

// Mock the keystore module
vi.mock('../lib/keystore', () => ({
  exportSecretKey: vi.fn(),
}));

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'profile.exportKeyClose': 'Close',
        'profile.exportKeyTitle': 'Backup your key',
        'profile.exportKeyHeading': 'Your Secret Key',
        'profile.exportKeyWarning': 'MicoPay never stores your secret key on our servers. Anyone with this key has full control of your funds.',
        'profile.exportKeyLabel': 'Secret Key',
        'profile.exportKeyShow': 'Reveal',
        'profile.exportKeyHide': 'Hide',
        'profile.exportKeyCopy': 'Copy to Clipboard',
        'profile.exportKeyCopied': 'Copied!',
        'profile.exportKeyQR': 'Scan to backup',
        'profile.exportKeyQRHint': 'Screenshot or print this QR code.',
        'profile.exportClipboardWarning': 'Clipboard warning: Android clipboard is readable by other apps.',
        'profile.exportRateLimited': 'Export rate-limited. Try again in',
        'profile.exportKeyError': 'Failed to load secret key.',
      };
      return translations[key] ?? key;
    },
  }),
}));

// Mock clipboard API
const mockWriteText = vi.fn();
Object.assign(navigator, {
  clipboard: {
    writeText: mockWriteText,
  },
});

const MOCK_SECRET_KEY = 'SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

describe('ExportSecretKeyModal — SEC-25 QR + Clipboard security', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    (exportSecretKey as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_SECRET_KEY);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders QR code after loading the secret key', async () => {
    render(<ExportSecretKeyModal onClose={onClose} />);

    // Should show loading state initially
    expect(screen.getByText('Your Secret Key')).toBeInTheDocument();

    // Wait for the secret key to load
    await waitFor(() => {
      expect(exportSecretKey).toHaveBeenCalledTimes(1);
    });

    // QR code should be rendered — the SVG element is from qrcode.react
    await waitFor(() => {
      const svg = document.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });
  });

  it('renders clipboard warning after copying to clipboard', async () => {
    mockWriteText.mockResolvedValue(undefined);
    render(<ExportSecretKeyModal onClose={onClose} />);

    await waitFor(() => {
      expect(exportSecretKey).toHaveBeenCalledTimes(1);
    });

    // Click copy button
    const copyBtn = screen.getByText('Copy to Clipboard');
    fireEvent.click(copyBtn);

    // Should show clipboard warning
    await waitFor(() => {
      expect(screen.getByText(/Clipboard warning/)).toBeInTheDocument();
    });

    // Should have written to clipboard
    expect(mockWriteText).toHaveBeenCalledWith(MOCK_SECRET_KEY);
  });

  it('shows rate-limit indicator after copying', async () => {
    mockWriteText.mockResolvedValue(undefined);
    render(<ExportSecretKeyModal onClose={onClose} />);

    await waitFor(() => {
      expect(exportSecretKey).toHaveBeenCalledTimes(1);
    });

    // Click copy button
    const copyBtn = screen.getByText('Copy to Clipboard');
    fireEvent.click(copyBtn);

    // Should show rate-limited message
    await waitFor(() => {
      expect(screen.getByText(/rate-limited/)).toBeInTheDocument();
    });

    // Copy button should be disabled now
    expect(copyBtn.closest('button')).toBeDisabled();
  });

  it('auto-clears clipboard after 30 seconds', async () => {
    mockWriteText.mockResolvedValue(undefined);
    render(<ExportSecretKeyModal onClose={onClose} />);

    await waitFor(() => {
      expect(exportSecretKey).toHaveBeenCalledTimes(1);
    });

    // Click copy button
    const copyBtn = screen.getByText('Copy to Clipboard');
    fireEvent.click(copyBtn);

    // Advance time by 30 seconds
    act(() => {
      vi.advanceTimersByTime(30000);
    });

    // Clipboard should have been cleared (written with empty string)
    expect(mockWriteText).toHaveBeenCalledWith('');
  });

  it('shows masked secret key by default and reveals on toggle', async () => {
    render(<ExportSecretKeyModal onClose={onClose} />);

    await waitFor(() => {
      expect(exportSecretKey).toHaveBeenCalledTimes(1);
    });

    // Should show masked dots
    expect(screen.getByText('•'.repeat(56))).toBeInTheDocument();

    // Click reveal
    const revealBtn = screen.getByText('Reveal');
    fireEvent.click(revealBtn);

    // Should show the actual key
    expect(screen.getByText(MOCK_SECRET_KEY)).toBeInTheDocument();
    expect(screen.getByText('Hide')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    render(<ExportSecretKeyModal onClose={onClose} />);

    await waitFor(() => {
      expect(exportSecretKey).toHaveBeenCalledTimes(1);
    });

    const closeBtn = screen.getByText('Close');
    fireEvent.click(closeBtn);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows error state when loading fails', async () => {
    (exportSecretKey as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('load failed'));
    render(<ExportSecretKeyModal onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load secret key.')).toBeInTheDocument();
    });
  });
});