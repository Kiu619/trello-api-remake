export const OBJECT_ID_RULE = /^[0-9a-fA-F]{24}$/
export const OBJECT_ID_RULE_MESSAGE = 'Your string fails to match the Object Id pattern!'

export const FIELD_REQUIRED_MESSAGE = 'This field is required.'
export const EMAIL_RULE = /^\S+@\S+\.\S+$/
export const EMAIL_RULE_MESSAGE = 'Email is invalid. (example@gmail.com)'
export const PASSWORD_RULE = /^(?=.*[a-zA-Z])(?=.*\d)[A-Za-z\d\W]{8,256}$/
export const PASSWORD_RULE_MESSAGE = 'Password must include at least 1 letter, a number, and at least 8 characters.'

export const LIMIT_COMMON_FILE_SIZE = 10485760 // byte = 10 MB
export const ALLOW_COMMON_IMG_FILE_TYPES = ['image/jpg', 'image/jpeg', 'image/png']
export const ALLOW_ATTACHMENT_FILE_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip',
  'application/x-rar-compressed',
  'application/x-7z-compressed',
  'application/x-tar',
  'application/x-gzip',
  'application/x-bzip2',
  'application/x-bzip',
  'application/x-iso9660-image',
  'application/x-msdownload',
  'application/x-sh',
  'application/x-csh',
  'application/x-java-archive',
  'application/x-httpd-php',
  'application/x-perl',
  'application/x-python-code',
  'application/x-ruby',
  'application/x-shellscript',
  'application/x-sql',
  'application/x-javascript',
  'application/x-typescript',
  'application/x-markdown',
  'application/x-latex',
  'application/x-tex',
  'application/x-bibtex',
  'application/x-c',
  'application/x-c++',
  'application/x-java',
  'application/x-python',
  'application/x-ruby',
  'application/x-shellscript',
  'application/x-sql',
  'application/x-javascript',
  'application/x-typescript',
  'application/x-markdown',
  'application/x-latex',
  'application/x-tex',
  'application/x-bibtex',
  'image/jpg',
  'image/jpeg',
  'image/png',
  'text/plain',
  'text/html',
  'text/css',
  'text/javascript',
  'text/markdown',
  'text/xml',
  'text/csv',
  'text/x-python',
  'text/x-ruby',
  'text/x-shellscript',
  'text/x-sql',
  'text/x-javascript',
  'text/x-typescript',
  'text/x-markdown',
  'text/x-latex',
  'text/x-tex',
  'text/x-bibtex'
]