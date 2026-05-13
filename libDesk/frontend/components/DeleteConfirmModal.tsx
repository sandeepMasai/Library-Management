import React from 'react';
import { ConfirmModal } from './ConfirmModal';

type Props = {
  visible: boolean;
  loading?: boolean;
  errorText?: string | null;
  title?: string;
  description?: string;
  cancelText?: string;
  confirmText?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DeleteConfirmModal(props: Props) {
  return (
    <ConfirmModal
      visible={props.visible}
      tone="danger"
      label="DANGER ACTION"
      title={props.title ?? 'Delete Account?'}
      description={
        props.description ??
        'This will permanently remove your student account from the library. This action cannot be undone.'
      }
      loading={props.loading}
      errorText={props.errorText}
      cancelText={props.cancelText ?? 'Cancel'}
      confirmText={props.confirmText ?? 'Delete'}
      confirmIcon="trash-outline"
      onCancel={props.onCancel}
      onConfirm={props.onConfirm}
    />
  );
}

