import React from 'react';
import { ConfirmModal } from './ConfirmModal';

type Props = {
  visible: boolean;
  loading?: boolean;
  title?: string;
  description?: string;
  cancelText?: string;
  confirmText?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function SignOutConfirmModal(props: Props) {
  return (
    <ConfirmModal
      visible={props.visible}
      tone="primary"
      label="CONFIRM"
      title={props.title ?? 'Sign out?'}
      description={props.description ?? 'You will need to sign in again to access your account.'}
      loading={props.loading}
      cancelText={props.cancelText ?? 'Cancel'}
      confirmText={props.confirmText ?? 'Sign out'}
      confirmIcon="log-out-outline"
      onCancel={props.onCancel}
      onConfirm={props.onConfirm}
    />
  );
}

