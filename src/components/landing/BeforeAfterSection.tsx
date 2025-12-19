import beforeAfterImage from "@/assets/google-profile-before-after.png";

export const BeforeAfterSection = () => {
  return (
    <section className="section-container">
      <h2 className="section-heading text-center">
        Google Profile Before & After
      </h2>
      <p className="section-subheading text-center mb-6">
        See what a fully optimised Google Business Profile looks like — plus automatic booking alerts.
      </p>
      
      <img 
        src={beforeAfterImage} 
        alt="Google Business Profile transformation showing before (empty profile with no reviews) and after (optimised profile with 4.8 stars, 25 reviews, Book Now button, and service areas) plus booking form and WhatsApp notification" 
        className="w-full rounded-xl shadow-lg"
      />
    </section>
  );
};
