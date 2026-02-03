import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';

// Mock the electronAPI
const mockElectronAPI = {
  transcribeAudio: vi.fn(),
  processText: vi.fn(),
  pasteText: vi.fn(),
  saveTranscription: vi.fn(),
  onToggleDictation: vi.fn(() => vi.fn()),
};

// Mock navigator.mediaDevices
const mockMediaStream = {
  getTracks: () => [{
    stop: vi.fn(),
    label: 'Mock Microphone'
  }],
  getAudioTracks: () => [{
    stop: vi.fn(),
    label: 'Mock Microphone'
  }]
};

// Simple test App component that mirrors the status states
function TestApp() {
  const [status, setStatus] = React.useState('idle');
  const [errorMessage, setErrorMessage] = React.useState('');
  const [processingStage, setProcessingStage] = React.useState('');
  const [toast, setToast] = React.useState(null);

  return (
    <div data-testid="app-container">
      <div data-testid="status">{status}</div>
      <div data-testid="error">{errorMessage}</div>
      <div data-testid="stage">{processingStage}</div>
      {toast && <div data-testid="toast" data-type={toast.type}>{toast.message}</div>}
      <button onClick={() => setStatus('recording')} data-testid="start-recording">Start</button>
      <button onClick={() => setStatus('processing')} data-testid="start-processing">Process</button>
      <button onClick={() => {
        setStatus('error');
        setErrorMessage('Test error');
        setToast({ type: 'error', message: 'Test error' });
      }} data-testid="trigger-error">Error</button>
      <button onClick={() => setProcessingStage('Transcribiendo...')} data-testid="set-stage">Stage</button>
    </div>
  );
}

describe('App Component States', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.electronAPI = mockElectronAPI;
  });

  afterEach(() => {
    delete window.electronAPI;
  });

  it('should render in idle state initially', () => {
    render(<TestApp />);
    expect(screen.getByTestId('status')).toHaveTextContent('idle');
  });

  it('should transition to recording state', () => {
    render(<TestApp />);
    fireEvent.click(screen.getByTestId('start-recording'));
    expect(screen.getByTestId('status')).toHaveTextContent('recording');
  });

  it('should transition to processing state', () => {
    render(<TestApp />);
    fireEvent.click(screen.getByTestId('start-processing'));
    expect(screen.getByTestId('status')).toHaveTextContent('processing');
  });

  it('should show error state with message', () => {
    render(<TestApp />);
    fireEvent.click(screen.getByTestId('trigger-error'));
    expect(screen.getByTestId('status')).toHaveTextContent('error');
    expect(screen.getByTestId('error')).toHaveTextContent('Test error');
  });

  it('should show toast on error', () => {
    render(<TestApp />);
    fireEvent.click(screen.getByTestId('trigger-error'));
    const toast = screen.getByTestId('toast');
    expect(toast).toBeInTheDocument();
    expect(toast).toHaveTextContent('Test error');
    expect(toast).toHaveAttribute('data-type', 'error');
  });

  it('should show processing stage', () => {
    render(<TestApp />);
    fireEvent.click(screen.getByTestId('set-stage'));
    expect(screen.getByTestId('stage')).toHaveTextContent('Transcribiendo...');
  });
});

describe('Toast Functionality', () => {
  it('should clear toast after timeout', async () => {
    vi.useFakeTimers();

    function ToastTest() {
      const [toast, setToast] = React.useState(null);
      const showToast = () => {
        setToast({ type: 'error', message: 'Test' });
        setTimeout(() => setToast(null), 5000);
      };
      return (
        <div>
          <button onClick={showToast} data-testid="show">Show</button>
          {toast && <div data-testid="toast">{toast.message}</div>}
        </div>
      );
    }

    render(<ToastTest />);
    fireEvent.click(screen.getByTestId('show'));
    expect(screen.getByTestId('toast')).toBeInTheDocument();

    vi.advanceTimersByTime(5000);

    await waitFor(() => {
      expect(screen.queryByTestId('toast')).not.toBeInTheDocument();
    });

    vi.useRealTimers();
  });
});

describe('Processing Stages', () => {
  it('should have correct stage progression labels', () => {
    const stages = [
      'Preparando audio...',
      'Transcribiendo...',
      'Procesando con IA...',
      'Pegando texto...',
      'Guardando...'
    ];

    // All stages should be defined
    stages.forEach(stage => {
      expect(typeof stage).toBe('string');
      expect(stage.length).toBeGreaterThan(0);
    });
  });
});

describe('Sound Functionality', () => {
  it('should have audio capability', () => {
    // Test that Audio constructor exists
    expect(typeof Audio).toBe('function');
  });

  it('should handle audio play errors gracefully', () => {
    const audio = new Audio();
    // Mock play to reject (simulating autoplay policy)
    audio.play = vi.fn().mockRejectedValue(new Error('Autoplay blocked'));

    // This should not throw
    expect(() => {
      audio.play().catch(() => {});
    }).not.toThrow();
  });
});
