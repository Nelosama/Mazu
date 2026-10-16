import { useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/services/api';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { Button, useToast } from '@/components/ui';
import { Icon } from '@/components/Icon';

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = 'image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif';

interface Props {
  businessId: string;
  kind: 'logo' | 'cover' | 'staff-photo' | 'service-photo' | 'portfolio';
  targetId?: string;
  currentUrl?: string | null;
  label: string;
  onUploaded: () => void;
  shape?: 'square' | 'wide' | 'round';
}

/** Validación previa en el navegador; la validación real (por contenido) ocurre en el servidor. */
export function ImageUpload({
  businessId,
  kind,
  targetId,
  currentUrl,
  label,
  onUploaded,
  shape = 'square',
}: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const input = useRef<HTMLInputElement>(null);
  const upload = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return api(`/businesses/${businessId}/media/${kind}`, {
        method: 'POST',
        body: fd,
        query: { targetId },
      });
    },
    onSuccess: () => {
      toast(t('media.uploaded'));
      onUploaded();
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  const box =
    shape === 'wide' ? 'h-24 w-40' : shape === 'round' ? 'h-16 w-16 rounded-full' : 'h-16 w-16';
  return (
    <div className="flex items-center gap-3">
      <div
        className={`${box} shrink-0 overflow-hidden rounded-xl bg-gray-100 ring-1 ring-gray-200`}
      >
        {currentUrl ? (
          <img src={currentUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-400">
            <Icon name="photo" className="h-6 w-6" />
          </div>
        )}
      </div>
      <div>
        <Button
          size="sm"
          variant="secondary"
          loading={upload.isPending}
          onClick={() => input.current?.click()}
        >
          {label}
        </Button>
        <p className="mt-1 text-xs text-gray-500">{t('media.hint')}</p>
      </div>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        aria-label={label}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          if (file.size > MAX_BYTES) return toast(t('media.tooLarge'), 'error');
          if (!file.type.startsWith('image/'))
            return toast(t('errors.UNSUPPORTED_IMAGE_TYPE'), 'error');
          upload.mutate(file);
        }}
      />
    </div>
  );
}
