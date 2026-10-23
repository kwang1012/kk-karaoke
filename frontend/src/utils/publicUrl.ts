/**
 * Files in public/ are referenced from the site root ("/avatars/bear.svg"). The desktop app loads the build
 * from disk (file://), where a leading slash points at the drive root, so there they are made relative to the page.
 */
export function publicUrl(src: string | undefined): string | undefined {
  if (src && src.startsWith('/') && !src.startsWith('//') && window.location.protocol === 'file:') return `.${src}`;
  return src;
}
