const MESSAGE_DE = {
  'Account deleted successfully': 'Konto erfolgreich gelöscht',
  'Admin dashboard fetched successfully': 'Admin-Dashboard erfolgreich abgerufen',
  'Admin password updated successfully': 'Admin-Passwort erfolgreich aktualisiert',
  'Admin profile fetched successfully': 'Admin-Profil erfolgreich abgerufen',
  'Admin profile updated successfully': 'Admin-Profil erfolgreich aktualisiert',
  'Categories fetched successfully': 'Kategorien erfolgreich abgerufen',
  'Check-in created successfully': 'Check-in erfolgreich erstellt',
  'Dish created successfully': 'Gericht erfolgreich erstellt',
  'Dish deleted successfully': 'Gericht erfolgreich gelöscht',
  'Dish details fetched successfully': 'Gerichtdetails erfolgreich abgerufen',
  'Dish fetched successfully': 'Gericht erfolgreich abgerufen',
  'Dish updated successfully': 'Gericht erfolgreich aktualisiert',
  'Image delete request processed successfully': 'Bildlöschung erfolgreich verarbeitet',
  'Image uploaded successfully': 'Bild erfolgreich hochgeladen',
  'Images uploaded successfully': 'Bilder erfolgreich hochgeladen',
  'Item saved successfully': 'Element erfolgreich gespeichert',
  'Login successful': 'Anmeldung erfolgreich',
  'n_krypted API is running': 'n_krypted API läuft',
  'Nearby restaurants fetched successfully': 'Restaurants in der Nähe erfolgreich abgerufen',
  'Owner check-ins fetched successfully': 'Check-ins des Restaurantinhabers erfolgreich abgerufen',
  'Owner dashboard fetched successfully': 'Dashboard des Restaurantinhabers erfolgreich abgerufen',
  'Owner dishes fetched successfully': 'Gerichte des Restaurantinhabers erfolgreich abgerufen',
  'Owner restaurant fetched successfully': 'Restaurant des Restaurantinhabers erfolgreich abgerufen',
  'Owner reviews fetched successfully': 'Bewertungen des Restaurantinhabers erfolgreich abgerufen',
  'Owner viewers fetched successfully': 'Besucher des Restaurantinhabers erfolgreich abgerufen',
  'Page fetched successfully': 'Seite erfolgreich abgerufen',
  'Password changed successfully': 'Passwort erfolgreich geändert',
  'Profile fetched successfully': 'Profil erfolgreich abgerufen',
  'Profile updated successfully': 'Profil erfolgreich aktualisiert',
  'Ratings summary fetched successfully': 'Bewertungsübersicht erfolgreich abgerufen',
  'Registration successful': 'Registrierung erfolgreich',
  'Restaurant deleted successfully': 'Restaurant erfolgreich gelöscht',
  'Restaurant details fetched successfully': 'Restaurantdetails erfolgreich abgerufen',
  'Restaurant dishes fetched successfully': 'Restaurantgerichte erfolgreich abgerufen',
  'Restaurant gallery image deleted successfully': 'Restaurant-Galeriebild erfolgreich gelöscht',
  'Restaurant gallery updated successfully': 'Restaurant-Galerie erfolgreich aktualisiert',
  'Restaurant profile created and pending admin approval': 'Restaurantprofil erstellt und wartet auf Admin-Freigabe',
  'Restaurant profile updated successfully': 'Restaurantprofil erfolgreich aktualisiert',
  'Restaurant status updated successfully': 'Restaurantstatus erfolgreich aktualisiert',
  'Restaurant view recorded successfully': 'Restaurantansicht erfolgreich erfasst',
  'Restaurants fetched successfully': 'Restaurants erfolgreich abgerufen',
  'Review created successfully': 'Bewertung erfolgreich erstellt',
  'Review deleted successfully': 'Bewertung erfolgreich gelöscht',
  'Review status updated successfully': 'Bewertungsstatus erfolgreich aktualisiert',
  'Reviews fetched successfully': 'Bewertungen erfolgreich abgerufen',
  'Saved item removed successfully': 'Gespeichertes Element erfolgreich entfernt',
  'Saved items fetched successfully': 'Gespeicherte Elemente erfolgreich abgerufen',
  'Static page saved successfully': 'Statische Seite erfolgreich gespeichert',
  'User deleted successfully': 'Benutzer erfolgreich gelöscht',
  'User details fetched successfully': 'Benutzerdetails erfolgreich abgerufen',
  'User status updated successfully': 'Benutzerstatus erfolgreich aktualisiert',
  'Users fetched successfully': 'Benutzer erfolgreich abgerufen',

  'Admin registration is only available for the first admin account': 'Admin-Registrierung ist nur für das erste Admin-Konto verfügbar',
  'Authentication token is required': 'Authentifizierungstoken ist erforderlich',
  'Current password is incorrect': 'Das aktuelle Passwort ist falsch',
  'Dish not found': 'Gericht nicht gefunden',
  'Dish not found for this restaurant': 'Gericht für dieses Restaurant nicht gefunden',
  'Failed to delete image from Cloudinary': 'Bild konnte nicht aus Cloudinary gelöscht werden',
  'Gallery image not found': 'Galeriebild nicht gefunden',
  'Invalid authentication token': 'Ungültiges Authentifizierungstoken',
  'Invalid email or password': 'Ungültige E-Mail-Adresse oder falsches Passwort',
  'Only image files are allowed': 'Nur Bilddateien sind erlaubt',
  'Page not found': 'Seite nicht gefunden',
  'Please upload an image file': 'Bitte laden Sie eine Bilddatei hoch',
  'Please upload at least one image file': 'Bitte laden Sie mindestens eine Bilddatei hoch',
  'publicId is required': 'publicId ist erforderlich',
  'Restaurant not found': 'Restaurant nicht gefunden',
  'Restaurant profile already exists for this owner': 'Für diesen Restaurantinhaber existiert bereits ein Restaurantprofil',
  'Restaurant profile not found for this owner': 'Restaurantprofil für diesen Restaurantinhaber nicht gefunden',
  'Review not found': 'Bewertung nicht gefunden',
  'Something went wrong': 'Etwas ist schiefgelaufen',
  'This account is not active': 'Dieses Konto ist nicht aktiv',
  'User no longer exists or is not active': 'Der Benutzer existiert nicht mehr oder ist nicht aktiv',
  'User not found': 'Benutzer nicht gefunden',
  'You do not have permission to perform this action': 'Sie haben keine Berechtigung, diese Aktion auszuführen'
};

const fallbackGerman = (messageEn) => {
  if (!messageEn) return MESSAGE_DE['Something went wrong'];

  if (messageEn.startsWith('Route not found:')) {
    return `Route nicht gefunden: ${messageEn.replace('Route not found: ', '')}`;
  }

  if (messageEn.startsWith('Invalid ') && messageEn.includes(':')) {
    return 'Ungültiger Wert in der Anfrage';
  }

  if (messageEn.endsWith(' already exists')) {
    const field = messageEn.replace(' already exists', '');
    return `${field} existiert bereits`;
  }

  if (messageEn === 'restaurant not found') return MESSAGE_DE['Restaurant not found'];
  if (messageEn === 'dish not found') return MESSAGE_DE['Dish not found'];

  if (messageEn.includes(':') || messageEn.includes('Required') || messageEn.includes('required')) {
    return 'Ungültige Anfrage. Bitte prüfen Sie die Eingaben';
  }

  return MESSAGE_DE['Something went wrong'];
};

export const getBilingualMessage = (message) => {
  const messageEn = typeof message === 'string' && message.trim()
    ? message
    : 'Something went wrong';

  return {
    de: MESSAGE_DE[messageEn] || fallbackGerman(messageEn),
    en: messageEn
  };
};
