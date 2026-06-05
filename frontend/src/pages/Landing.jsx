import React from 'react';
import { Link } from 'react-router-dom';

const Landing = () => {
  return (
    <div className="bg-kotoba-background">
      {/* Hero Section */}
      <div className="relative bg-kotoba-primary overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="relative z-10 pb-8 bg-kotoba-primary sm:pb-16 md:pb-20 lg:max-w-2xl lg:w-full lg:pb-28 xl:pb-32">
            <main className="mt-10 mx-auto max-w-7xl px-4 sm:mt-12 sm:px-6 md:mt-16 lg:mt-20 lg:px-8 xl:mt-28">
              <div className="sm:text-center lg:text-left">
                <h1 className="text-4xl tracking-tight font-extrabold text-white sm:text-5xl md:text-6xl">
                  <span className="block xl:inline">Your own home for</span>{' '}
                  <span className="block text-kotoba-secondary xl:inline">teaching languages.</span>
                </h1>
                <p className="mt-3 text-base text-gray-300 sm:mt-5 sm:text-lg sm:max-w-xl sm:mx-auto md:mt-5 md:text-xl lg:mx-0">
                  A branded site, lesson scheduling, classroom video, materials, payments and student admin — all in one place. Plus the option to grow through Kotobaseed's comprehensible-input marketplace.
                </p>
                <div className="mt-5 sm:mt-8 sm:flex sm:justify-center lg:justify-start">
                  <div className="rounded-md shadow">
                    <Link
                      to="/onboarding/tutor"
                      className="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-kotoba-text bg-kotoba-secondary hover:bg-kotoba-secondary-dark md:py-4 md:text-lg md:px-10"
                    >
                      Start teaching
                    </Link>
                  </div>
                  <div className="mt-3 sm:mt-0 sm:ml-3">
                    <Link
                      to="/pricing"
                      className="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-white bg-kotoba-primary hover:bg-green-800 md:py-4 md:text-lg md:px-10"
                    >
                      See pricing
                    </Link>
                  </div>
                </div>
              </div>
            </main>
          </div>
        </div>
        <div className="lg:absolute lg:inset-y-0 lg:right-0 lg:w-1/2">
          <img
            className="h-56 w-full object-cover sm:h-72 md:h-96 lg:w-full lg:h-full"
            src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=1051&q=80"
            alt="Language tutor at their laptop"
          />
        </div>
      </div>

      {/* How it Works */}
      <div className="py-12 bg-kotoba-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:text-center">
            <h2 className="text-base text-kotoba-primary font-semibold tracking-wide uppercase">How Kotobaseed works</h2>
            <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-kotoba-primary sm:text-4xl">
              Three steps to teaching online — properly.
            </p>
          </div>

          <div className="mt-10">
            <dl className="space-y-10 md:space-y-0 md:grid md:grid-cols-3 md:gap-x-8 md:gap-y-10">
              <div className="relative">
                <dt>
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-kotoba-primary text-white">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7l9-4 9 4M5 7v10a2 2 0 002 2h10a2 2 0 002-2V7M9 21V11h6v10" />
                    </svg>
                  </div>
                  <p className="ml-16 text-lg leading-6 font-medium text-kotoba-text">Pick your slug</p>
                </dt>
                <dd className="mt-2 ml-16 text-base text-kotoba-text">
                  Sign up and your site goes live at <span className="font-medium">yourname.kotobaseed.net</span>. Add a custom domain later on the Pro plan.
                </dd>
              </div>

              <div className="relative">
                <dt>
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-kotoba-primary text-white">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M3 14h18m-9-7v14M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z" />
                    </svg>
                  </div>
                  <p className="ml-16 text-lg leading-6 font-medium text-kotoba-text">Connect Stripe</p>
                </dt>
                <dd className="mt-2 ml-16 text-base text-kotoba-text">
                  We set up Stripe Connect for you. Take card payments, get paid into your bank — Kotobaseed never holds your money.
                </dd>
              </div>

              <div className="relative">
                <dt>
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-kotoba-primary text-white">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="ml-16 text-lg leading-6 font-medium text-kotoba-text">Open your doors</p>
                </dt>
                <dd className="mt-2 ml-16 text-base text-kotoba-text">
                  Publish lesson packages, take bookings, run classes in our built-in classroom. Optionally list comprehensible-input projects in the marketplace.
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {/* For Tutors Section */}
      <div className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-8 lg:items-center">
            <div>
              <h2 className="text-3xl font-extrabold text-kotoba-primary sm:text-4xl">
                Everything a tutor needs. Nothing they don't.
              </h2>
              <p className="mt-3 max-w-3xl text-lg text-kotoba-text">
                A focused toolkit so you can spend your time teaching, not configuring software.
              </p>
              <div className="mt-8 space-y-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <div className="flex items-center justify-center h-12 w-12 rounded-md bg-kotoba-primary text-white">
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg leading-6 font-medium text-kotoba-text">Your site, your brand</h3>
                    <p className="mt-2 text-base text-kotoba-text">
                      A subdomain (or your own domain) with a landing page builder, theme picker, and your photo on the front page. No drag-and-drop nightmare.
                    </p>
                  </div>
                </div>

                <div className="flex">
                  <div className="flex-shrink-0">
                    <div className="flex items-center justify-center h-12 w-12 rounded-md bg-kotoba-primary text-white">
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg leading-6 font-medium text-kotoba-text">Bookings, classroom, materials</h3>
                    <p className="mt-2 text-base text-kotoba-text">
                      Students book directly. You teach in our video classroom. Lesson plans, vocab and homework live in one place. Both of you can see what's next.
                    </p>
                  </div>
                </div>

                <div className="flex">
                  <div className="flex-shrink-0">
                    <div className="flex items-center justify-center h-12 w-12 rounded-md bg-kotoba-primary text-white">
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg leading-6 font-medium text-kotoba-text">Honest pricing</h3>
                    <p className="mt-2 text-base text-kotoba-text">
                      Start free — pay nothing until you earn. Switch to Pro when you outgrow it. We never lock you in or take a cut without telling you.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-10 lg:mt-0">
              <img className="rounded-lg shadow-lg" src="https://images.unsplash.com/photo-1531482615713-2afd69097998?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80" alt="Tutor preparing a lesson" />
            </div>
          </div>
        </div>
      </div>

      {/* For Students / Marketplace Section */}
      <div className="py-16 bg-kotoba-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-8 lg:items-center">
            <div className="order-2 lg:order-1">
              <img className="rounded-lg shadow-lg" src="https://images.unsplash.com/photo-1516321318423-f06f85e504b3?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80" alt="Student learning online" />
            </div>
            <div className="mt-10 lg:mt-0 order-1 lg:order-2">
              <h2 className="text-3xl font-extrabold text-kotoba-primary sm:text-4xl">
                Looking to learn?
              </h2>
              <p className="mt-3 max-w-3xl text-lg text-kotoba-text">
                Browse the comprehensible-input library — real videos made for the language you're actually studying — or book one-to-one lessons with the tutors who created them.
              </p>
              <div className="mt-8 space-y-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <div className="flex items-center justify-center h-12 w-12 rounded-md bg-kotoba-primary text-white">
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg leading-6 font-medium text-kotoba-text">Vetted tutors</h3>
                    <p className="mt-2 text-base text-kotoba-text">
                      Every tutor finishes Stripe identity verification before going live. Optional language and credential checks for extra peace of mind.
                    </p>
                  </div>
                </div>

                <div className="flex">
                  <div className="flex-shrink-0">
                    <div className="flex items-center justify-center h-12 w-12 rounded-md bg-kotoba-primary text-white">
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v12a1 1 0 01-1 1h-7l-4 4v-4H4a1 1 0 01-1-1V4z" />
                      </svg>
                    </div>
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg leading-6 font-medium text-kotoba-text">Crowdfund a topic</h3>
                    <p className="mt-2 text-base text-kotoba-text">
                      Can't find a video about "ordering coffee in Osaka"? Post a request, chip in, and a tutor builds it. You and other backers get to watch.
                    </p>
                  </div>
                </div>

                <div className="flex">
                  <div className="flex-shrink-0">
                    <div className="flex items-center justify-center h-12 w-12 rounded-md bg-kotoba-primary text-white">
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg leading-6 font-medium text-kotoba-text">14-day refund window</h3>
                    <p className="mt-2 text-base text-kotoba-text">
                      Bought a lesson and changed your mind? Cancel inside two weeks and we refund automatically.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Call to Action */}
      <div className="bg-kotoba-primary">
        <div className="max-w-2xl mx-auto text-center py-16 px-4 sm:py-20 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
            <span className="block">Run your tutoring business</span>
            <span className="block">on your terms.</span>
          </h2>
          <p className="mt-4 text-lg leading-6 text-gray-300">
            Free to start. Five minutes to get your site live. Stripe handles the payments. You handle the teaching.
          </p>
          <div className="mt-8 flex justify-center gap-3 flex-wrap">
            <Link
              to="/onboarding/tutor"
              className="inline-flex items-center justify-center px-5 py-3 border border-transparent text-base font-medium rounded-md text-kotoba-text bg-kotoba-secondary hover:bg-kotoba-secondary-dark"
            >
              Start teaching
            </Link>
            <Link
              to="/pricing"
              className="inline-flex items-center justify-center px-5 py-3 border border-white text-base font-medium rounded-md text-white hover:bg-green-800"
            >
              See pricing
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Landing;
