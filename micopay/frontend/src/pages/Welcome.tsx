/**
 * Incorporacion de persona: comprension, no alta.
 *
 * No cambia nada en el servidor. Al terminar, en la base de datos no hay ni un
 * campo distinto — lo unico que cambia esta en la cabeza de quien lo lee. Por
 * eso el "ya visto" se guarda solo en el dispositivo.
 *
 * Cubre las cuatro cosas que una persona necesita entender ANTES de mover
 * dinero, y que hasta ahora no le decia nadie:
 *
 *   1. Su dinero vive en este telefono. Nadie mas lo tiene.
 *   2. Hay una llave. Si la pierde sin respaldo, pierde los fondos.
 *      En la web, la cuenta y la llave son las de su billetera.
 *   3. Que es un cash-out y por que el dinero queda retenido.
 *   4. Que va a quedar con una persona real, y que el codigo QR es lo que
 *      cierra la operacion.
 *
 * El punto 3 es el que faltaba por completo: P0-5 se cerro en agosto dando por
 * cubierto el onboarding, pero sus seis criterios hablaban solo de la wallet.
 * Nadie explicaba el producto.
 */

import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { IS_EXTERNAL_SIGNER } from '../lib/signer/mode';
import OnboardingFlow, {
  StepText,
  StepPoint,
  type OnboardingStep,
} from '../components/onboarding/OnboardingFlow';

interface Props {
  /** Alias de la persona, para que el saludo no sea generico. */
  username?: string | null;
  /** Se llama al terminar o al salir: el llamador marca el "ya visto". */
  onDone: () => void;
  /** Lleva al respaldo de la llave secreta. */
  onBackupKey?: () => void;
}

/** <b> de las traducciones se dibuja como <strong>. */
const B = { b: <strong /> };

export default function Welcome({ username, onDone, onBackupKey }: Props) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);

  const allSteps: OnboardingStep[] = [
    IS_EXTERNAL_SIGNER ? {
      id: 'wallet',
      title: username ? t('welcome.hello', { name: username }) : t('welcome.walletTitle'),
      lead: t('welcome.lead'),
      body: (
        <>
          <StepText><Trans i18nKey="welcome.walletText" components={B} /></StepText>
          <StepPoint icon="lock"><Trans i18nKey="welcome.walletKey" components={B} /></StepPoint>
          <StepPoint icon="warning"><Trans i18nKey="welcome.walletWarning" components={B} /></StepPoint>
        </>
      ),
    } : {
      id: 'wallet',
      title: username ? t('welcome.hello', { name: username }) : t('welcome.phoneTitle'),
      lead: t('welcome.lead'),
      body: (
        <>
          <StepText><Trans i18nKey="welcome.phoneText" components={B} /></StepText>
          <StepPoint icon="lock"><Trans i18nKey="welcome.phoneKey" components={B} /></StepPoint>
          <StepPoint icon="warning"><Trans i18nKey="welcome.phoneWarning" components={B} /></StepPoint>
        </>
      ),
    },
    {
      id: 'backup',
      title: t('welcome.backupTitle'),
      lead: t('welcome.backupLead'),
      body: (
        <>
          <StepText>{t('welcome.backupText1')}</StepText>
          <StepText>{t('welcome.backupText2')}</StepText>
          {onBackupKey && (
            <button
              onClick={onBackupKey}
              className="min-h-12 w-full mt-2 border-2 border-verde text-verde font-bold rounded-sm"
            >
              {t('welcome.backupNow')}
            </button>
          )}
        </>
      ),
    },
    {
      id: 'cashout',
      title: t('welcome.cashoutTitle'),
      lead: t('welcome.cashoutLead'),
      body: (
        <>
          <StepText><Trans i18nKey="welcome.cashoutText" components={B} /></StepText>
          <StepPoint icon="sell"><Trans i18nKey="welcome.cashoutSell" components={B} /></StepPoint>
          <StepPoint icon="payments"><Trans i18nKey="welcome.cashoutBuy" components={B} /></StepPoint>
          <StepText>{t('welcome.cashoutFee')}</StepText>
        </>
      ),
    },
    {
      id: 'escrow',
      title: t('welcome.escrowTitle'),
      lead: t('welcome.escrowLead'),
      body: (
        <>
          <StepText><Trans i18nKey="welcome.escrowText" components={B} /></StepText>
          <StepPoint icon="handshake">{t('welcome.escrowRelease')}</StepPoint>
          <StepPoint icon="schedule"><Trans i18nKey="welcome.escrowTimeout" components={B} /></StepPoint>
          <StepText>{t('welcome.escrowNobody')}</StepText>
        </>
      ),
    },
    {
      id: 'meeting',
      title: t('welcome.meetingTitle'),
      lead: t('welcome.meetingLead'),
      body: (
        <>
          <StepPoint icon="location_on"><Trans i18nKey="welcome.meetingZone" components={B} /></StepPoint>
          <StepPoint icon="qr_code_2"><Trans i18nKey="welcome.meetingQr" components={B} /></StepPoint>
          <StepPoint icon="shield"><Trans i18nKey="welcome.meetingSafe" components={B} /></StepPoint>
        </>
      ),
      nextLabel: t('welcome.start'),
    },
  ];
  // El respaldo es de la llave del telefono; en la web lo resuelve la billetera.
  const steps = IS_EXTERNAL_SIGNER ? allSteps.filter((s) => s.id !== 'backup') : allSteps;

  return (
    <OnboardingFlow
      steps={steps}
      index={index}
      onIndexChange={setIndex}
      onFinish={onDone}
      onExit={onDone}
      exitLabel={t('welcome.skip')}
    />
  );
}
