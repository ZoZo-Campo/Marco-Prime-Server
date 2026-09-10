import { useEffect, useRef, useState } from "preact/hooks";

interface UseRfidOptions {
  disabled?: boolean;
}

const RFID_MIN_DIGITS = 5;
const RFID_MAX_KEY_INTERVAL_MS = 100;
const RFID_END_DELAY_MS = 180;
const MANUAL_INPUT_TIMEOUT_MS = 5_000;

function digitFromKeyboardEvent(event: KeyboardEvent) {
  if (/^\d$/.test(event.key)) return event.key;

  const physicalDigit = /^(?:Digit|Numpad)(\d)$/.exec(event.code);
  return physicalDigit?.[1];
}

export function useRfid(options: UseRfidOptions = {}) {
  const { disabled = false } = options;
  const [value, setValue] = useState<string | undefined>(undefined);
  const [scanId, setScanId] = useState(0);
  const [inputLength, setInputLength] = useState(0);
  const bufferRef = useRef("");
  const resetTimerRef = useRef<number | undefined>(undefined);
  const lastDigitAtRef = useRef<number | undefined>(undefined);
  const rapidInputRef = useRef(true);

  const commitBuffer = () => {
    const cardNumber = bufferRef.current;
    bufferRef.current = "";
    lastDigitAtRef.current = undefined;
    rapidInputRef.current = true;
    setInputLength(0);
    if (!/^\d+$/.test(cardNumber)) return;
    setValue(cardNumber);
    setScanId((current) => current + 1);
  };

  const clearBuffer = () => {
    bufferRef.current = "";
    lastDigitAtRef.current = undefined;
    rapidInputRef.current = true;
    setInputLength(0);
    window.clearTimeout(resetTimerRef.current);
  };

  useEffect(() => {
    if (disabled) {
      clearBuffer();
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === "Tab") {
        window.clearTimeout(resetTimerRef.current);
        if (bufferRef.current.length > 0) {
          event.preventDefault();
          commitBuffer();
        }
        return;
      }

      if (event.key === "Backspace" && bufferRef.current.length > 0) {
        event.preventDefault();
        window.clearTimeout(resetTimerRef.current);
        bufferRef.current = bufferRef.current.slice(0, -1);
        setInputLength(bufferRef.current.length);
        resetTimerRef.current = window.setTimeout(
          clearBuffer,
          MANUAL_INPUT_TIMEOUT_MS,
        );
        return;
      }

      if (event.key === "Escape") {
        clearBuffer();
        return;
      }

      const digit = digitFromKeyboardEvent(event);
      if (digit !== undefined) {
        const eventTime = event.timeStamp;
        if (bufferRef.current.length === 0) {
          rapidInputRef.current = true;
        } else if (
          lastDigitAtRef.current !== undefined &&
          eventTime - lastDigitAtRef.current > RFID_MAX_KEY_INTERVAL_MS
        ) {
          rapidInputRef.current = false;
        }
        lastDigitAtRef.current = eventTime;

        if (bufferRef.current.length < 32) {
          bufferRef.current += digit;
          setInputLength(bufferRef.current.length);
        }
        window.clearTimeout(resetTimerRef.current);
        const looksLikeRfidScan =
          rapidInputRef.current &&
          bufferRef.current.length >= RFID_MIN_DIGITS;
        resetTimerRef.current = window.setTimeout(
          looksLikeRfidScan ? commitBuffer : clearBuffer,
          looksLikeRfidScan
            ? RFID_END_DELAY_MS
            : MANUAL_INPUT_TIMEOUT_MS,
        );
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.clearTimeout(resetTimerRef.current);
      bufferRef.current = "";
    };
  }, [disabled]);

  return {
    value,
    scanId,
    inputLength,
    clear: () => {
      clearBuffer();
      setValue(undefined);
    },
  };
}
