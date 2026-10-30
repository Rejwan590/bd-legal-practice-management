import React, { useState, useEffect } from 'react';
import { repositories } from '../data/repositories';
import { SecurityContext } from '../data/types';

interface ClientAvatarProps {
  clientId?: string;
  name?: string;
  clientName?: string;
  nameBn?: string;
  photoUrl?: string | null;
  hasPhoto?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  context?: SecurityContext;
}

// Module-level photo cache to prevent repeated network requests across avatar instances
const clientPhotoCache = new Map<string, string | null>();
const pendingPhotoRequests = new Map<string, Promise<string | null>>();

export function invalidateClientPhotoCache(clientId: string, newUrl?: string | null) {
  if (newUrl !== undefined) {
    clientPhotoCache.set(clientId, newUrl);
  } else {
    clientPhotoCache.delete(clientId);
  }
}

export function getInitials(name: string, nameBn?: string): string {
  if (!name && nameBn) {
    return nameBn.slice(0, 2);
  }
  if (!name) return 'CL';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const COLOR_PALETTE = [
  'bg-emerald-700 text-emerald-100',
  'bg-teal-700 text-teal-100',
  'bg-cyan-800 text-cyan-100',
  'bg-blue-800 text-blue-100',
  'bg-indigo-800 text-indigo-100',
  'bg-violet-800 text-violet-100',
  'bg-amber-800 text-amber-100',
  'bg-stone-700 text-stone-100',
];

function getColorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % COLOR_PALETTE.length;
  return COLOR_PALETTE[index];
}

const SIZE_CLASSES = {
  xs: 'w-6 h-6 text-xs',
  sm: 'w-8 h-8 text-xs font-medium',
  md: 'w-10 h-10 text-sm font-semibold',
  lg: 'w-16 h-16 text-lg font-bold',
  xl: 'w-24 h-24 text-2xl font-bold sm:w-28 sm:h-28',
};

export const ClientAvatar: React.FC<ClientAvatarProps> = ({
  clientId,
  name,
  clientName,
  nameBn,
  photoUrl,
  hasPhoto,
  size = 'md',
  className = '',
  context,
}) => {
  const [imgSrc, setImgSrc] = useState<string | null>(() => {
    if (photoUrl !== undefined) return photoUrl;
    if (hasPhoto === false) return null;
    if (clientId && clientPhotoCache.has(clientId)) return clientPhotoCache.get(clientId)!;
    return null;
  });
  const [loadError, setLoadError] = useState(false);
  const effectiveName = name || clientName || '';

  useEffect(() => {
    if (photoUrl !== undefined) {
      setImgSrc(photoUrl);
      if (clientId) clientPhotoCache.set(clientId, photoUrl);
      setLoadError(false);
      return;
    }

    // If client is known to not have a photo, do not trigger network fetch or 404
    if (hasPhoto === false) {
      setImgSrc(null);
      if (clientId) clientPhotoCache.set(clientId, null);
      setLoadError(false);
      return;
    }

    if (!clientId || !context) {
      return;
    }

    // Check cached result first
    if (clientPhotoCache.has(clientId)) {
      setImgSrc(clientPhotoCache.get(clientId)!);
      setLoadError(false);
      return;
    }

    let isMounted = true;
    let fetchPromise = pendingPhotoRequests.get(clientId);

    if (!fetchPromise) {
      fetchPromise = repositories.client
        .getPhoto(context, clientId)
        .then((photo) => {
          let resolvedUrl: string | null = null;
          if (photo?.dataUrl) {
            resolvedUrl = photo.dataUrl;
          } else if (photo?.bytes && photo?.mime) {
            resolvedUrl = `data:${photo.mime};base64,${photo.bytes}`;
          }
          clientPhotoCache.set(clientId, resolvedUrl);
          return resolvedUrl;
        })
        .catch(() => {
          // Cache null to prevent repeated failed requests
          clientPhotoCache.set(clientId, null);
          return null;
        })
        .finally(() => {
          pendingPhotoRequests.delete(clientId);
        });
      pendingPhotoRequests.set(clientId, fetchPromise);
    }

    fetchPromise.then((url) => {
      if (isMounted) {
        setImgSrc(url);
        setLoadError(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [clientId, photoUrl, hasPhoto, context]);

  const initials = getInitials(effectiveName, nameBn);
  const colorClass = getColorForName(effectiveName || 'Client');
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.md;

  if (imgSrc && !loadError) {
    return (
      <img
        src={imgSrc}
        alt={effectiveName || 'Client Photo'}
        onError={() => setLoadError(true)}
        className={`rounded-full object-cover border border-amber-900/40 shadow-inner flex-shrink-0 ${sizeClass} ${className}`}
      />
    );
  }

  return (
    <div
      className={`rounded-full flex items-center justify-center font-serif tracking-wider shadow-inner flex-shrink-0 border border-amber-900/30 select-none ${colorClass} ${sizeClass} ${className}`}
      title={effectiveName}
      aria-label={effectiveName}
    >
      <span>{initials}</span>
    </div>
  );
};
