// Interaction/capture checks must never consume a real server key now that
// opening a study requests teaching automatically.
export async function mockTutor(page) {
  await page.route('**/api/tutor',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({answer:'This organ supports the frog’s body. Observe its shape and compare it with the other organs.'})}));
  await page.route('https://generativelanguage.googleapis.com/**',route=>route.abort());
}
