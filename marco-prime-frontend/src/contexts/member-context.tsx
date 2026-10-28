import { createContext } from "preact";
import type { PropsWithChildren } from "preact/compat";
import { useContext, useEffect, useRef, useState } from "preact/hooks";
import type z from "zod";
import { useApi } from "../hooks/use-api";
import { useRfid } from "../hooks/use-rfid";
import { memberSchema } from "../schemas/member.schema";
import type { MemberSchema } from "../schemas/member.schema";
import { apiUrl } from "../config/api";
import { shopping } from "./shopping-context";
import { addRecentMember } from "../utils/recent-members";

const MemberContext = createContext<{
  data: z.infer<typeof memberSchema> | null;
  loading: boolean;
  error: Error | null;
  inputLength: number;
  paused: boolean;
  retry: () => Promise<void>;
  submitCardNumber: (cardNumber: string) => boolean;
  clear: () => void;
  pause: () => void;
  resume: () => void;
  select: (member: MemberSchema) => void;
} | null>(null);

export function useMember() {
  const context = useContext(MemberContext);
  if (!context)
    throw new Error("useMember should be used inside a MemberProvider");
  return context;
}

export function MemberProvider({
  children,
  disabled = false,
}: PropsWithChildren<{ disabled?: boolean }>) {
  const [paused, setPaused] = useState(false);
  const [selectedMember, setSelectedMember] = useState<MemberSchema | null>(
    null,
  );
  const {
    value: memberCardId,
    scanId,
    inputLength,
    submit: submitRfid,
    clear: clearRfid,
  } = useRfid({ disabled: paused || disabled });
  const { data: fetchedMember, loading, error, refetch, reset } = useApi(
    memberSchema,
    apiUrl(`member/${memberCardId}`),
    { immediate: false },
  );
  const scannedMember =
    memberCardId !== undefined &&
    fetchedMember?.cardNumber === Number(memberCardId)
      ? fetchedMember
      : null;
  const data = selectedMember ?? scannedMember;

  const lastCardRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (data) addRecentMember(data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.id]);

  useEffect(() => {
    if (!memberCardId) return;
    const nextCard = String(memberCardId);
    if (lastCardRef.current !== undefined && lastCardRef.current !== nextCard) {
      shopping.reset();
    }
    lastCardRef.current = nextCard;
    setSelectedMember(null);
    refetch();
  }, [memberCardId, scanId]);

  const pause = () => setPaused(true);
  const resume = () => setPaused(false);
  const clear = () => {
    setSelectedMember(null);
    clearRfid();
    reset();
  };
  const submitCardNumber = (cardNumber: string) => {
    setSelectedMember(null);
    reset();
    return submitRfid(cardNumber);
  };
  const select = (member: MemberSchema) => {
    clearRfid();
    reset();
    setSelectedMember(member);
    setPaused(false);
  };

  return (
    <MemberContext.Provider
      value={{
        data,
        loading,
        error,
        inputLength,
        paused,
        retry: refetch,
        submitCardNumber,
        clear,
        pause,
        resume,
        select,
      }}
    >
      {children}
    </MemberContext.Provider>
  );
}
