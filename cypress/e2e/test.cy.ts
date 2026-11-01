describe('Movie Match', () => {
  it('affiche la page de connexion au démarrage', () => {
    cy.visit('/')
    cy.location('pathname').should('eq', '/login')
    cy.contains('ion-title', 'Connexion')
  })
})
