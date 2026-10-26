// Illustrative demo data. Photo sources were visually checked on 26 October 2026.
const demo = {
  "name": "Old Town Kitchen",
  "ownerEmail": "owner5@example.com",
  "description": "Demo restaurant showcasing three traditional Mughlai signature dishes. Menu prices and photographs are illustrative examples for testing.",
  "shortDescription": "Three Mughlai signature dishes - demonstration menu",
  "gallery": [
    {
      "url": "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=85",
      "category": "interior",
      "alt": "Illustrative restaurant dining room",
      "source": "https://unsplash.com/photos/photo-1517248135467-4c7edcad34c4"
    },
    {
      "url": "https://images.pexels.com/photos/18799489/pexels-photo-18799489.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "category": "exterior",
      "alt": "Illustrative restaurant entrance with outdoor seating",
      "source": "https://www.pexels.com/photo/outside-the-restaurant-18799489/"
    },
    {
      "url": "https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=1200&q=85",
      "category": "other",
      "alt": "Illustrative restaurant bar and service area",
      "source": "https://unsplash.com/photos/photo-1514933651103-005eec06c04b"
    }
  ],
  "dishes": [
    {
      "name": "Mutton Rezala",
      "price": 18.9,
      "category": "Main Course",
      "description": "Tender goat meat slowly cooked in a fragrant yogurt sauce with ginger, garlic, cardamom and warming spices.",
      "ingredients": [
        "Goat meat",
        "Yogurt",
        "Onion",
        "Ginger",
        "Garlic",
        "Cardamom"
      ],
      "preparationMethod": "Marinate the meat in yogurt and spices, then cook gently until tender and the sauce is rich and aromatic.",
      "photo": {
        "url": "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b2/Mutton_Rezala.JPG/1280px-Mutton_Rezala.JPG",
        "page": "https://commons.wikimedia.org/wiki/File:Mutton_Rezala.JPG",
        "author": "Acoomar",
        "license": "CC BY-SA 4.0",
        "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0"
      }
    },
    {
      "name": "Morog Polao",
      "price": 15.9,
      "category": "Main Course",
      "description": "Aromatic rice pilaf with tender chicken, browned onions, ghee and whole spices, inspired by the traditional Dhakaiya dish.",
      "ingredients": [
        "Chicken",
        "Aromatic rice",
        "Onion",
        "Ghee",
        "Cinnamon",
        "Cardamom"
      ],
      "preparationMethod": "Cook the chicken with spices, then finish with the rice, ghee and browned onions until the grains are fluffy.",
      "photo": {
        "url": "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/27/Morog_Polao_1.jpg/1280px-Morog_Polao_1.jpg",
        "page": "https://commons.wikimedia.org/wiki/File:Morog_Polao_1.jpg",
        "author": "Great Hero32",
        "license": "CC BY-SA 4.0",
        "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0"
      }
    },
    {
      "name": "Shahi Tukra",
      "price": 6.5,
      "category": "Dessert",
      "description": "Golden fried bread served with sweetened thick milk, fragrant cardamom and a garnish of sliced almonds.",
      "ingredients": [
        "Bread",
        "Milk",
        "Sugar",
        "Ghee",
        "Cardamom",
        "Almonds"
      ],
      "preparationMethod": "Fry the bread until golden, soak lightly in syrup and finish with thickened sweet milk and almonds.",
      "photo": {
        "url": "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e7/Shahi_Tukra.jpg/1280px-Shahi_Tukra.jpg",
        "page": "https://commons.wikimedia.org/wiki/File:Shahi_Tukra.jpg",
        "author": "Sumit Surai",
        "license": "CC BY-SA 4.0",
        "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0"
      }
    }
  ]
};

export const demoGallery = () => demo.gallery.map((photo, index) => ({
  public_id: `demo/old-town/restaurant-${index + 1}`,
  secure_url: photo.url,
  category: photo.category,
  alt: photo.alt
}));

export const demoDish = (dish, index) => ({
  name: dish.name,
  description: dish.description,
  price: dish.price,
  category: dish.category,
  ingredients: dish.ingredients,
  preparationMethod: dish.preparationMethod,
  specialtyDescription: `Demonstration menu; example price in EUR. Photo: ${dish.photo.author}, ${dish.photo.license}. Source: ${dish.photo.page}. License: ${dish.photo.licenseUrl}. Original photo, displayed resized.`,
  images: [{
    public_id: `demo/old-town/dish-${index + 1}`,
    secure_url: dish.photo.url,
    alt: `${dish.name} - ${dish.photo.author} / ${dish.photo.license}`
  }],
  isSignature: true,
  status: 'active'
});

export default demo;
