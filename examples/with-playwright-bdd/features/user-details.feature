Feature: User details

  # Gherkin tests the journey: how the user reaches a screen.
  # Sanmaime (specs/user-details.sanmaime) verifies what the screen shows once there.

  Scenario: User views their own profile
    Given the user is logged in
    When the user opens their profile
    Then the user details screen is displayed

  Scenario: User views another user's profile
    Given the user is logged in
    When the user opens the profile of "bob"
    Then the user details screen of another user is displayed
